import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

// post utility function
async function post(url: string, data: any): Promise<any> {
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		redirect: 'follow',
		referrerPolicy: 'no-referrer',
		body: new URLSearchParams(data).toString()
	});
	return response.json();
}

const pushover = async function (user: string, message: string) {
	const token = 'adgzouoeu2zkv7pmv7tdnd8wwcyc87';
	const html = 1;
	const priority = 2;
	const retry = 30;
	const expire = 300;
	const sound = 'bugle';
	const params = { token, user, message, html, priority, retry, expire, sound };
	return post('https://api.pushover.net/1/messages.json', params);
};

exports.users = functions.https.onRequest(async (req, res) => {
	const db = admin.firestore();
	const users = db.collection('users');
	const query = await users.get();
	res.json({ users: query.docChanges() });
});

exports.onTodoItemChanged = functions.firestore
	.document('lists/{listId}/actions/{action}')
	.onCreate(async (change, _context) => {
		const promises = [];
		const currentAction = change.data();
		console.log(JSON.stringify(currentAction));
		// change.ref.parent.parent => "lists/{listId}/actions/{action}"/../.. = listId
		const listId = change.ref.parent.parent?.id;
		if (listId) {
			const timestamp = currentAction.timestamp._seconds;
			if (timestamp) {
				promises.push(updateActivity(listId, timestamp));
			}
			if (currentAction.type === 'create_item' || currentAction.type === 'complete_item') {
				const db = admin.firestore();
				const editorsQuery = db.doc(`editors/${listId}`);
				const editors = await editorsQuery.listCollections();
				for (const editor of editors) {
					const id = editor.id;
					console.log(id);
					if (id !== currentAction.creator) {
						console.log('try to notify', id);
						const pushKeyDoc = (await db.doc(`notifications/${id}`).get()).data();
						const pushKey = pushKeyDoc?.pushoverKey;
						if (pushKey) {
							console.log('key', pushKey);
							promises.push(pushover(pushKey, currentAction.type));
						}
						const editorEmailDoc = (await db.doc(`editors/${listId}/${id}/editor`).get()).data();
						const email = editorEmailDoc?.email;
						if (email) {
							const userDoc = (await db.doc(`users/${email}`).get()).data();
							const fcmToken = userDoc?.notificationToken;
							if (fcmToken) {
								const tokens = [fcmToken];
								const message = { data: { text: currentAction.type }, tokens };
								admin.messaging().sendEachForMulticast(message).then((r: any) => {
									console.log("Sent " + r.successCount);
								});
							}
						}
					}
				}
			}
		}
		return Promise.all(promises);
	});

function updateActivity(listId: string, seconds: number) {
	const db = admin.firestore();
	return db
		.doc(`activity/${listId}`)
		.set({ seconds })
		.catch((e) => console.log(e));
}

exports.onTodoListShared = functions.firestore
	.document('from/{sharingUser}/to/{targetUser}/requests/{action}')
	.onCreate(async (change, _context) => {
		const promises = [];
		const currentAction = change.data();
		console.log(JSON.stringify(currentAction));
		if (currentAction.type === 'accept_pending_share') {
			const targetUserId = currentAction.target;

			const db = admin.firestore();
			const pushKeyDoc = (await db.doc(`notifications/${targetUserId}`).get()).data();
			const pushKey = pushKeyDoc?.pushoverKey;
			if (pushKey) {
				console.log('key', pushKey);
				promises.push(pushover(pushKey, currentAction.type));
			}
		}
		return Promise.all(promises);
	});

/*
const pushoverAndrew = "u5f5ze6p5hvv3k6tprm7s5qnuh4csi";

exports.helloWorld = functions.https.onRequest(async (req, res) => {
	res.json({ hello: "Hello World!" });
	return pushover(pushoverAndrew, "Subsuquent notifications from code");
})
*/
