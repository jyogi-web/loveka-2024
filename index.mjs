import 'dotenv/config'; // 環境変数を読み込むための設定
import express from 'express'; // Expressフレームワークをインポート
import { Client, middleware } from '@line/bot-sdk'; // LINE Messaging API SDKをインポート
import ejs from 'ejs'; // EJSテンプレートエンジンをインポート

const app = express(); // Expressアプリケーションを作成
const port = process.env.port || 3000; // ポート番号を設定（環境変数から取得、デフォルトは3000）
app.set('view engine', 'ejs'); // テンプレートエンジンにEJSを指定
app.engene('ejs', require("ejs").__express); // テンプレートエンジンにEJSを指定
app.set('views', './views'); // テンプレートファイルの場所を指定

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
app.post('/send-message', (req, res) => {
  const message = {
    type: 'text',
    text: 'Hello from LINE Messaging API' // 送信するメッセージの内容
  };

  client.pushMessage('U4cb7355db135ea19f7d2101a5315bfab', message) // 指定したユーザーIDにメッセージを送信
    .then(() => {
      res.status(200).send('Message sent'); // メッセージ送信成功時のレスポンス
    })
    .catch((err) => {
      console.error(err); // エラー発生時にエラーログを出力
      res.status(500).send('Failed to send message'); // メッセージ送信失敗時のレスポンス
    });
});

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

// イベントを処理する関数
async function handleEvent(event) {
  console.log(`eventだよ: ${JSON.stringify(event, null, 2)}`); // 受信したイベントをログに出力
  if (event.type !== 'message') {
    return Promise.resolve(null); // メッセージイベント以外は無視
  }

  if (event.message.type === 'text') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: event.message.text // テキストメッセージに対して同じテキストで返信
    });
  } else if (event.message.type === 'sticker') {
    return client.replyMessage(event.replyToken, {
      type: 'sticker',
      packageId: event.message.packageId,
      stickerId: event.message.stickerId // スタンプメッセージに対して同じスタンプで返信
    });
  } else if (event.message.type === 'image') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '画像を受け取りました。' // 画像メッセージに対してテキストで返信
    });
  }

  return Promise.resolve(null); // その他のメッセージタイプは無視
}