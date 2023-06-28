import * as functions from 'firebase-functions';
// import * as admin from 'firebase-admin';

exports.helloWorld = functions.https.onRequest(async (req, res) => {
  res.json({hello: 'Hello World!'});
})