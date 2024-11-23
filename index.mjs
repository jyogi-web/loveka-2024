import 'dotenv/config';
import express from 'express';
import { Client, middleware } from '@line/bot-sdk';
import ejs from 'ejs';
import path from 'path';
import admin from 'firebase-admin';

// 環境変数からサービスアカウントキーを取得
const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);

// Firebase Admin SDKを初期化
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
const port = 3000;
app.set('view engine', 'ejs');
app.engine('ejs', ejs.__express);
app.set('views', './views');
app.use('/stylesheets', express.static(path.join(process.cwd(), 'stylesheets')));

// エラーハンドリング
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

const db = admin.firestore();
const collectionRef = db.collection('responses');
const quiz = db.collection('quiz'); // Firestoreのクイズコレクションを取得
const imagetest = db.collection('imagetest'); // Firestoreの画像テストコレクションを取得

// LINE Messaging APIの設定
const config = {
  channelSecret: process.env.ChannelSecret,
  channelAccessToken: process.env.channelAccessToken
};

const client = new Client(config);

// ルートエンドポイント
app.get("/", (req, res) => {
  res.render("index");
});

// Firestoreからランキングデータを取得する関数
async function getRankingData() {
  const snapshot = await collectionRef.orderBy('timestamp', 'desc').get();
  const rankingData = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    rankingData.push({
      id: doc.id, // ドキュメントIDを含める
      message: data.message, // タイトルフィールドを含める
      timestamp: data.timestamp, // タイムスタンプフィールドを含める
      name: data.userName //  ユーザーの名前を含める
    });
  });
  return rankingData;
}


// ランキング表示
app.get("/ranking", async (req, res) => {
  try {
    const rankingData = await getRankingData();
    
    res.render("ranking", { rankingData });
  } catch (error) {
    console.error('Error getting ranking data:', error);
    res.status(500).send('Error getting ranking data');
  }

  
});

// Webhookエンドポイントの設定
app.post('/webhook', middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(event => handleEvent(event)))
    .then(() => res.sendStatus(200))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// サーバーを起動
app.listen(port, () => console.log(`Server is running on port ${port}`));


// クイズ関係の変数定義
let quizQuestion ="";
let quizAnswer ="";
let randomIndex = 0;

// イベントを処理する関数
async function handleEvent(event) {
  console.log(`eventだよ: ${JSON.stringify(event, null, 2)}`); // 受信したイベントをログに出力
  // console.log(`event.message.text: ${event.message.text}`); // 受信したメッセージをログに出力
  if (event.type !== 'message') {
    return Promise.resolve(null);
  }

  // Firestoreにデータを保存
  const profile = await client.getProfile(event.source.userId);
  const userName = profile.displayName;
  const timestamp = new Date().toISOString();
  await collectionRef.add({
    userId: event.source.userId,
    userName: userName,
    message: event.message.text,
    timestamp: timestamp
  });
  const quizData = await quiz.get();
  const quizDataArray = quizData.docs.map(doc => doc.data());
  // console.log(`quizDataArray: ${JSON.stringify(quizDataArray, null, 2)}`);
  
  // クイズ関係処理まとめ
  switch (event.message.text) {
    case 'クイズ一覧':
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'クイズ一覧です：' + quizDataArray.map(quiz => quiz.question).join('\n\n')
      });
    case 'クイズ作成':
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'クイズ作成を行います\nクイズの問題を入力してください\n【問題の書き方】\n問題：〇〇\n答え：〇〇\n開催日時：20xx/01/01 00:00'
      });
    case 'クイズ教えて':
      // ランダムにクイズを選択
      randomIndex = Math.floor(Math.random() * quizDataArray.length);
      quizQuestion = quizDataArray[randomIndex].question;
      quizAnswer = quizDataArray[randomIndex].answer;
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: quizQuestion // クイズ問題を送信
      });
    default:
      break;
  }

  // クイズ作成(要改善~Flexとかで値だけ入力できるようにする~)
  if (event.message.type === 'text' && event.message.text.startsWith('問題：')) {
    // メッセージから問題文と答えを抽出
    const messageParts = event.message.text.split('\n');
    const questionPart = messageParts.find(part => part.startsWith('問題：'));
    const answerPart = messageParts.find(part => part.startsWith('答え：'));
    const DayPart = messageParts.find(part => part.startsWith('開催日時：'));
  
    if (!questionPart || !answerPart || !DayPart) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '問題文の形式が正しくありません。\n【形式例】\n問題：〇〇\n答え：〇〇\n開催日時：20xx/01/01 00:00'
      });
    }
  
    // 問題文と答えを取得
    const question = questionPart.slice(3).trim();
    const answer = answerPart.slice(3).trim();
    const day = DayPart.slice(5).trim();

    // 開催日時をTimestamp型に変換
    const date = new Date(day);
    console.log(`date: ${date}`);
    if (isNaN(date.getTime())) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '開催日時の形式が正しくありません。\n【形式例】\n開催日時：20xx/01/01 00:00'
      });
    }
    const timestamp = admin.firestore.Timestamp.fromDate(date);

    if (!question || !answer || !day) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '問題文・答え・開催日時のいずれかが空欄です。'
      });
    }
  
    // Firestoreに登録
    try {
      await quiz.add({
        question: question,
        answer: answer,
        day: timestamp
      });  
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `クイズを登録しました！\n問題：「${question}」\n答え：「${answer}」\n開催日時：「${DayPart}」`
      });
    } catch (error) {
      console.error('Firestore登録エラー:', error);
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'クイズの登録中にエラーが発生しました。もう一度お試しください。'
      });
    }
  }
  
// Firestoreのデータを表示するエンドポイント
app.get('/data', async (req, res) => {
  try {
    const snapshot = await collectionRef.get();
    const itemsname = [];
    snapshot.forEach((doc) => {
      itemsname.push(doc.data());
    });
    res.render('template', { itemsname: itemsname });
  } catch (error) {
    console.error('Error getting documents:', error);
    res.status(500).send('Error getting documents');
  }
  
});
app.get('/responses/:userId', async (req, res) => {
  const userId = req.params.userId;
  console.log('プル', userId);
  const userData = await getUserData(userId);
  if (userData) {
    res.render('ranking', { rankingData: userData }); // userData を rankingData として渡す
    console.log(`userdate表記`, userData);
  } else {
    res.status(404).send('User not found');
  }
});

  // Answerの判定
  if(event.message.type === 'text' && event.message.text === quizAnswer) {
    return client.replyMessage(event.replyToken, [{
      type: 'text',
      text: '正解です！'
    }, {
      type: 'text',
      text: 'ランキングページへのリンクです'
    }]);
  }else if(event.message.type === 'text' && event.message.text !== quizAnswer) {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '不正解です！'
    });
  }

  switch (event.message.type) {
    case 'text':
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: event.message.text // テキストメッセージに対して同じテキストで返信
      });
    case 'sticker':
      return client.replyMessage(event.replyToken, {
            type: 'sticker',
            packageId: event.message.packageId,
            stickerId: event.message.stickerId // スタンプメッセージに対して同じスタンプで返信
          });
          case 'image':
            // 画像データを取得
            console.log(`replayToken: ${event.replyToken}`);
            console.log('画像データを取得します');
            const stream = await client.getMessageContent(event.message.id);
            let data = [];
            stream.on('data', (chunk) => {
              data.push(chunk);
            });
            
            stream.on('end', async () => {
              const buffer = Buffer.concat(data); // 受け取った画像データをバッファとしてまとめる
              // ここで画像データを処理する（例：ファイルに保存する、クラウドストレージにアップロードするなど）
              console.log(`画像データ: ${buffer}`);
              imagetest.add({
                buffer: buffer.toString('base64')
              });
              console.log('画像データをFirestoreに保存しました');

              // Firestoreから保存済み画像を取得
              const snapshot = await imagetest.get();
              if (snapshot.empty) {
                console.log('Firestoreに保存された画像がありません。');
                return client.replyMessage(event.replyToken, {
                  type: 'text',
                  text: '比較対象の画像がありません。'
                });
              }
          
              let isMatch = false;
              snapshot.forEach((doc) => {
                const storedBufferData = doc.data().buffer; // Firestoreから取得した画像データ
                if (!storedBufferData) {
                  console.log('Firestoreに保存された画像データがありません。');
                  return;
                }
          
                const storedBuffer = Buffer.from(storedBufferData, 'base64'); // Firestoreに保存された画像をBuffer形式に変換
          
                // バイト列を比較
                if (Buffer.compare(buffer, storedBuffer) === 0) {
                  isMatch = true;
                }
              });
          
              // 比較結果をLINEユーザーに通知
              if (isMatch) {
                await client.replyMessage(event.replyToken, {
                  type: 'text',
                  text: '画像が一致しました！'
                });
              } else {
                await client.replyMessage(event.replyToken, {
                  type: 'text',
                  text: '画像が一致しませんでした。'
                });
              }
              
              console.log('画像データを取得しました');
            });
          
            // return client.replyMessage(event.replyToken, {
            //   type: 'text',
            //   text: '画像を受け取りました。' // 画像メッセージに対してテキストで返信
            // });
          
    default:
      return Promise.resolve(null); // その他のメッセージタイプは無視
  }
}
