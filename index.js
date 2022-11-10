import "dotenv/config"; // loads variables from .env file
import express from "express";
import bodyParser from "body-parser";
import * as paypal from "./paypal-api.js";
import * as firebase_admin_app from "firebase-admin/app";
import * as firebase_admin_fstr from "firebase-admin/firestore";
import serviceAccount from "./serviceAccountKey.json" assert { type: "json" };

firebase_admin_app.initializeApp({
  credential: firebase_admin_app.cert(serviceAccount),
});

const PORT = process.env.PORT || 3000;
const app = express();
const jsonParser = bodyParser.json();
const db = firebase_admin_fstr.getFirestore();
let uid = "";
let email = "";
let price = "";
let paymentId = "";

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.send("Test");
  res.sendStatus(200)
})

app.get("/favicon.ico", (req, res) => {
  res.sendStatus(404);
});

app.get("/api/:uid", async (req, res) => {
  try {
    uid = req.params.uid;
    const docRef = db.collection("user-data").doc(uid);
    const doc = await docRef.get();
    if (doc.exists) {
      res.sendFile("public/index.html", { root: "." });
      let params = "";
      params = doc.data()["paymentParams"];
      email = params.split("/")[0];
      price = params.split("/")[1];
    } else {
      res.sendFile("public/something_went_wrong.html", { root: "." });
    }
  } catch (error) {
    res.status(500).send(error);
  }
});

app.post("/api/orders", async (req, res) => {
  try {
    const order = await paypal.createOrder(email, price);

    const paymentRef = await db.collection("user-data").doc(uid).collection("payments").doc(paymentId).get();

    if (paymentRef.exists) {
      res.json(order);
    } else {
      res.sendFile("public/something_went_wrong.html", { root: "." });
    }

  } catch (err) {
    res.status(500).send(err);
  }
});

app.post("/api/orders/:orderID/capture", async (req, res) => {
  const { orderID } = req.params;
  try {
    const captureData = await paypal.capturePayment(orderID);
    res.json(captureData);
  } catch (err) {
    res.status(500).send(err);
  }
});

app.post("/api/firestore/paying/done", async (req, res) => {
  try {
    const docRef = db.collection("user-data").doc(uid);
    await docRef.update({
      isPayed: true,
      paymentParams: "",
    });

    const paymentRef = db.collection("user-data").doc(uid).collection("payments").doc(paymentId);
    await paymentRef.delete();

    res.redirect("https://u7thdevs.page.link/app");
  } catch (error) {
    res.send(error);
  }
});

app.post("/write/to/database", jsonParser, async (req, res) => {
  try {
    console.log("POST received!");

    await updateParkingSpaceData(
      req.body.parking.parkingSpaceId,
      req.body.parking.parkingId,
      req.body.parking
    );

    await updateUserParkingData(req.body.parking.driverId, req.body.parking);

    await notifyUser(
      req.body.notification.notificationId,
      req.body.notification.userId,
      req.body.notification.userNotification
    );

    //user feedback
    res.status(200);
    res.setHeader("Content-type", "application/json");
    res.send("{result : 1}");

  } catch (error) {
    console.log(error);
    res.status(500).send(error);
  }
});

app.get("/api/firestore/payment", async (req, res) => {
  try {

    let data = await getPaymentDetails();
    res.send(data);
  } catch (e) {
    res.send("Error");
  }
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});

async function updateParkingSpaceData(spaceId, parkingId, parking) {
  const docRef = db
    .collection("parking-spaces")
    .doc(spaceId)
    .collection("parking-sessions")
    .doc(parkingId);

  await docRef.set(parking);
}

async function updateUserParkingData(userId, parking) {
  const docRef = db
    .collection("user-data")
    .doc(userId)
    .collection("user-parkings")
    .doc(parking.parkingId);

  await docRef.set(parking);
}

async function notifyUser(notificationId, userId, notification) {
  const docRef = db
    .collection("user-data")
    .doc(userId)
    .collection("notifications")
    .doc();
  notification.notificationId = docRef.id;

  await docRef.set(notification);
}

async function getPaymentDetails() {
  let data = null;
  (await db.collection("user-data")
    .doc(uid).collection('payments').get()).docs.forEach((value) => {
      paymentId = value.id;
      data = value.data();
    });

  return data;
}
