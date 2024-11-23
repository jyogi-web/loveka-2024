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

// イベントを処理する関数
async function handleEvent(event) {
  console.log(`eventだよ: ${JSON.stringify(event, null, 2)}`);
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

  if (event.message.type === 'text') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: event.message.text
    });
  } else if (event.message.type === 'sticker') {
    return client.replyMessage(event.replyToken, {
      type: 'sticker',
      packageId: event.message.packageId,
      stickerId: event.message.stickerId
    });
  } else if (event.message.type === 'image') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '画像を受け取りました。'
    });
  }

  return Promise.resolve(null);
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