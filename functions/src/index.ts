import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { AnyAction } from '@reduxjs/toolkit';

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

function makeNotification(action: AnyAction) {
	let title = 'Test title';
	const body = action.payload.description;
	const image = 'https://todo-firebase-1a740.web.app/brownCheck.png';
	if (action.type === 'create_item') {
		title = 'New Todo Item';
	} else if (action.type === 'complete_item') {
		title = 'Todo Completed';
	} else if (action.type === 'incoming_request') {
		title = 'List Shared';
	}
	return {
		title,
		body,
		image
	};
}
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
							const notificationTokens = await db.collection(`users/${email}/tokens`).get();
							const tokens: string[] = [];
							notificationTokens.forEach((doc) => tokens.push(doc.id));
							if (tokens.length) {
								const notification = makeNotification(currentAction as AnyAction);
								const message = {
									data: { action: JSON.stringify(currentAction) },
									notification,
									tokens
								};
								admin
									.messaging()
									.sendEachForMulticast(message)
									.then((r: any) => {
										console.log('Sent ' + r.successCount + ' Failed ' + r.failureCount);
										r.responses.forEach((resp: any, index: number) => {
											if (!resp.success) {
												console.log('Multicase send failed for token: ', tokens[index], resp.error);
												promises.push(db.doc(`users/${email}/tokens/${tokens[index]}`).delete());
											}
										});
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

exports.onLogin = functions.firestore
	.document('users/{email}')
	.onWrite(async (change, _context) => {
		const promises = [];
		const user = change.after.data();
		// console.log(JSON.stringify(user));
		if (user?.notificationToken) {
			const userDocPath = change.after.ref;
			const tokenList = userDocPath.collection('tokens');
			promises.push(tokenList.doc(`${user.notificationToken}`).set({ timestamp: Date.now() }));
		}
		return Promise.all(promises);
	});

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
