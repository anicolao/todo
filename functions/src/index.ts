import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { AnyAction } from '@reduxjs/toolkit';

admin.initializeApp();

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
	} else if (action.type === 'accept_pending_share') {
		title = 'List Shared';
	}
	return {
		title,
		body,
		image
	};
}

async function notifyUser(id: string, currentAction: AnyAction): Promise<any> {
	const promises: Promise<any>[] = [];
	const db = admin.firestore();
	const notificationTokens = await db.collection(`notifications/${id}/tokens`).get();
	const tokens: string[] = [];
	notificationTokens.forEach((doc) => tokens.push(doc.id));
	if (tokens.length) {
		const notification = makeNotification(currentAction);
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
						promises.push(db.doc(`notifications/${id}/tokens/${tokens[index]}`).delete());
					}
				});
			});
	}
	return Promise.all(promises);
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
						promises.push(notifyUser(id, currentAction as AnyAction));
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
			const id = change.after.data()?.uid;
			if (id !== undefined) {
				const db = admin.firestore();
				const notificationTokenList = db.collection(`notifications/${id}/tokens`);
				promises.push(
					notificationTokenList.doc(`${user.notificationToken}`).set({ timestamp: Date.now() })
				);
			}
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
			promises.push(notifyUser(targetUserId, currentAction as AnyAction));
		}
		return Promise.all(promises);
	});
