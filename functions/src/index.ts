import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

// post utility function
async function post(url: string, data: any): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    redirect: "follow",
    referrerPolicy: "no-referrer",
    body: new URLSearchParams(data).toString(),
  });
  return response.json();
}

const pushover = async function (user: string, message: string) {
  const token = "adgzouoeu2zkv7pmv7tdnd8wwcyc87";
  const html = 1;
  const priority = 2;
  const retry = 30;
  const expire = 300;
  const sound = "bugle";
  const params = { token, user, message, html, priority, retry, expire, sound };
  return post("https://api.pushover.net/1/messages.json", params);
};

exports.users = functions.https.onRequest(async (req, res) => {
  const db = admin.firestore();
  const users = db.collection("users");
  const query = await users.get();
  res.json({ users: query.docChanges() });
})

exports.onTodoItemChanged = functions.firestore.document("lists/{listId}/actions/{action}").onCreate(async (change, _context) => {
  const currentAction = change.data();
  console.log(JSON.stringify(currentAction));
  return pushover(pushoverAndrew, currentAction.type);
})

const pushoverAndrew = "u5f5ze6p5hvv3k6tprm7s5qnuh4csi";

exports.helloWorld = functions.https.onRequest(async (req, res) => {
  res.json({ hello: "Hello World!" });
  return pushover(pushoverAndrew, "First notification from code");
})
