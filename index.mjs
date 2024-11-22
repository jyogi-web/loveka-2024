import 'dotenv/config'; // 環境変数を読み込むための設定
import express from 'express'; // Expressフレームワークをインポート
import { Client, middleware } from '@line/bot-sdk'; // LINE Messaging API SDKをインポート
import ejs from 'ejs'; // EJSテンプレートエンジンをインポート
import path from 'path'; // パス操作用のモジュールをインポート

// Firebase Admin SDKを初期化s
import admin from 'firebase-admin';
import functions from 'firebase-functions';
// 環境変数からサービスアカウントキーを取得
const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);

// Firebase Admin SDKを初期化
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express(); // Expressアプリケーションを作成
const port = 3000; // ポート番号を設定（環境変数から取得、デフォルトは3000）
app.set('view engine', 'ejs'); // テンプレートエンジンにEJSを指定
app.engine('ejs', ejs.__express); // テンプレートエンジンにEJSを指定
app.set('views', './views'); // テンプレートファイルの場所を指定
// 静的ファイルの提供
app.use('/stylesheets', express.static(path.join(process.cwd(), 'stylesheets')));

// エラーハンドリング
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const docRef = db.collection('users').doc('alovelace');

const quiz = db.collection('quiz'); // Firestoreのクイズコレクションを取得

// LINE Messaging APIの設定
const config = {
  channelSecret: process.env.ChannelSecret, // 環境変数からチャネルシークレットを取得
  channelAccessToken: process.env.channelAccessToken // 環境変数からチャネルアクセストークンを取得
};

const client = new Client(config); // LINE Messaging APIクライアントを作成

// ルートエンドポイント
app.get("/", (req, res) => {
  res.render("index");
});

//ランキング表示
app.get("/ranking", (req, res) => {
  const data = [
    { rank: 1, name: "山田太郎", score: 100 },
    { rank: 2, name: "鈴木花子", score: 90 },
    { rank: 3, name: "佐藤次郎", score: 80 }
  ];
  res.render("ranking", { items:data }); // テンプレートにデータを渡してレンダリング
});


// メッセージ送信エンドポイント
// app.post('/send-message', (req, res) => {
//   const message = {
//     type: 'text',
//     text: 'Hello from LINE Messaging API' // 送信するメッセージの内容
//   };

//   client.pushMessage('U4cb7355db135ea19f7d2101a5315bfab', message) // 指定したユーザーIDにメッセージを送信
//     .then(() => {
//       res.status(200).send('Message sent'); // メッセージ送信成功時のレスポンス
//     })
//     .catch((err) => {
//       console.error(err); // エラー発生時にエラーログを出力
//       res.status(500).send('Failed to send message'); // メッセージ送信失敗時のレスポンス
//     });
// });

// Webhookエンドポイント
app.post("/webhook", middleware(config), (req, res) => {
  // 受信したイベントを処理
  Promise
    .all(req.body.events.map(handleEvent)) // 受信したイベントごとに handleEvent 関数を呼び出す
    .then((result) => res.json(result)) // 処理結果をJSON形式で返す
    .catch((err) => {
      console.error(err); // エラー発生時にエラーログを出力
      res.status(500).end(); // エラー発生時のレスポンス
    });
});

// サーバーを起動
app.listen(port, () => console.log(`Server is running on port ${port}`)); // サーバー起動時にポート番号を出力


// クイズ関係の変数定義
let quizQuestion ="";
let quizAnswer ="";
let randomIndex = 0;

// イベントを処理する関数
async function handleEvent(event) {
  console.log(`eventだよ: ${JSON.stringify(event, null, 2)}`); // 受信したイベントをログに出力
  console.log(`event.message.text: ${event.message.text}`); // 受信したメッセージをログに出力
  if (event.type !== 'message') {
    return Promise.resolve(null); // メッセージイベント以外は無視
  }

  // Firestoreからクイズを取得
  const quizData = await quiz.get();
  const quizDataArray = quizData.docs.map(doc => doc.data());
  console.log(`quizDataArray: ${JSON.stringify(quizDataArray, null, 2)}`);
  
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
        text: 'クイズ作成を行います\nクイズの問題を入力してください\n【問題の書き方】\n問題：〇〇\n答え：〇〇'
      });
    case 'クイズ教えて':
      // ランダムにクイズを選択
      quizQuestion = quizDataArray[randomIndex].question;
      quizAnswer = quizDataArray[randomIndex].answer;
      randomIndex = Math.floor(Math.random() * quizDataArray.length);
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: quizQuestion // クイズ問題を送信
      });
    default:
      break;
  }

  // クイズ作成
  if (event.message.text.startsWith('問題：')) {
    // メッセージから問題文と答えを抽出
    const messageParts = event.message.text.split('\n');
    const questionPart = messageParts.find(part => part.startsWith('問題：'));
    const answerPart = messageParts.find(part => part.startsWith('答え：'));
  
    if (!questionPart || !answerPart) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '問題文の形式が正しくありません。\n【形式例】\n問題：〇〇\n答え：〇〇'
      });
    }
  
    // 問題文と答えを取得
    const question = questionPart.slice(3).trim();
    const answer = answerPart.slice(3).trim();
  
    if (!question || !answer) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '問題文または答えが空欄です。'
      });
    }
  
    // Firestoreに登録
    try {
      await quiz.add({ question, answer });
  
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `クイズを登録しました！\n問題：「${question}」\n答え：「${answer}」`
      });
    } catch (error) {
      console.error('Firestore登録エラー:', error);
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'クイズの登録中にエラーが発生しました。もう一度お試しください。'
      });
    }
  }

  // Answerの判定
  if(event.message.text === quizAnswer) {
    return client.replyMessage(event.replyToken, [{
      type: 'text',
      text: '正解です！'
    }, {
      type: 'text',
      text: 'ランキングページへのリンクです'
    }]);
  }else if(event.message.text !== quizAnswer) {
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
      return client.replyMessage(event.replyToken, {
            type: 'text',
            text: '画像を受け取りました。' // 画像メッセージに対してテキストで返信
          });
    default:
      return Promise.resolve(null); // その他のメッセージタイプは無視
  }
}