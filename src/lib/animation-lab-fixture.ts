import firebase from '$lib/firebase';
import { create_item, set_due_date, star_item } from '$lib/components/items';
import { set_label_query } from '$lib/components/labels';
import { create_label, create_list, rename_list } from '$lib/components/lists';
import {
	createUserWithEmailAndPassword,
	signInWithEmailAndPassword,
	updateProfile,
	type User
} from 'firebase/auth';
import { doc, Timestamp, writeBatch } from 'firebase/firestore';

export const animationLabFixture = {
	email: 'animation-lab@todo.local',
	password: 'todo-animation-lab',
	name: 'Animation Reviewer',
	upperListId: 'animation-lab-upper',
	lowerListId: 'animation-lab-lower',
	labelId: 'animation-lab-label',
	starredItemId: 'animation-lab-starred',
	undatedItemId: 'animation-lab-undated'
};

async function signIn(): Promise<User> {
	try {
		const credential = await createUserWithEmailAndPassword(
			firebase.auth,
			animationLabFixture.email,
			animationLabFixture.password
		);
		await updateProfile(credential.user, { displayName: animationLabFixture.name });
		return credential.user;
	} catch (error) {
		if ((error as { code?: string }).code !== 'auth/email-already-in-use') throw error;
		return (
			await signInWithEmailAndPassword(
				firebase.auth,
				animationLabFixture.email,
				animationLabFixture.password
			)
		).user;
	}
}

function actionDocument(
	batch: ReturnType<typeof writeBatch>,
	listId: string,
	id: string,
	action: object,
	creator: string,
	millis: number
) {
	batch.set(doc(firebase.firestore, 'lists', listId, 'actions', id), {
		...action,
		creator,
		timestamp: millis === 0 ? 0 : Timestamp.fromMillis(millis)
	});
}

export async function prepareAnimationLabFixture() {
	if (import.meta.env.VITE_ANIMATION_LAB !== 'true') {
		throw new Error('The real-product animation lab must be started with npm run dev:animations.');
	}

	const user = await signIn();
	const uid = user.uid;
	const listIds = [
		animationLabFixture.upperListId,
		animationLabFixture.lowerListId,
		animationLabFixture.labelId
	];

	// Establish the reviewer's access first. Firestore rules require this document
	// to exist before the list history and the second editor can be written.
	const access = writeBatch(firebase.firestore);
	for (const id of listIds) {
		access.set(doc(firebase.firestore, 'editors', id, uid, 'editor'), {
			email: animationLabFixture.email
		});
	}
	await access.commit();

	const seededAt = Date.now() - 60_000;
	const batch = writeBatch(firebase.firestore);
	batch.set(doc(firebase.firestore, 'users', animationLabFixture.email), {
		uid,
		name: animationLabFixture.name,
		email: animationLabFixture.email,
		photo: '',
		activity_timestamp: Date.now()
	});
	batch.set(doc(firebase.firestore, 'users', 'andrew@todo.local'), {
		uid: 'animation-lab-andrew',
		name: 'Andrew',
		email: 'andrew@todo.local',
		photo: '',
		activity_timestamp: Date.now()
	});
	for (const id of listIds) {
		batch.set(doc(firebase.firestore, 'editors', id, 'animation-lab-andrew', 'editor'), {
			email: 'andrew@todo.local'
		});
	}

	const lists = [
		[animationLabFixture.upperListId, 'Today'],
		[animationLabFixture.lowerListId, 'Weekend errands']
	] as const;
	for (const [index, [id, name]] of lists.entries()) {
		actionDocument(batch, id, 'name', rename_list({ id, name }), uid, 0);
		batch.set(doc(firebase.firestore, 'from', uid, 'to', uid, 'requests', `list-${index}`), {
			...create_list({ id, name }),
			creator: uid,
			creatorEmail: animationLabFixture.email,
			target: uid,
			timestamp: Timestamp.fromMillis(seededAt + index * 1000)
		});
	}

	actionDocument(
		batch,
		animationLabFixture.upperListId,
		'item-starred',
		create_item({
			list_id: animationLabFixture.upperListId,
			id: animationLabFixture.starredItemId,
			description: 'Review animation timing'
		}),
		uid,
		seededAt + 3000
	);
	actionDocument(
		batch,
		animationLabFixture.upperListId,
		'item-star',
		star_item({
			list_id: animationLabFixture.upperListId,
			id: animationLabFixture.starredItemId,
			starred: true,
			star_timestamp: seededAt + 3100
		}),
		uid,
		seededAt + 3100
	);
	const today = new Date();
	actionDocument(
		batch,
		animationLabFixture.upperListId,
		'item-due',
		set_due_date({
			list_id: animationLabFixture.upperListId,
			id: animationLabFixture.starredItemId,
			due_date: {
				year: today.getFullYear(),
				month: today.getMonth() + 1,
				day: today.getDate()
			}
		}),
		uid,
		seededAt + 3200
	);
	actionDocument(
		batch,
		animationLabFixture.upperListId,
		'item-undated',
		create_item({
			list_id: animationLabFixture.upperListId,
			id: animationLabFixture.undatedItemId,
			description: 'Plan the next transition'
		}),
		uid,
		seededAt + 3300
	);
	actionDocument(
		batch,
		animationLabFixture.lowerListId,
		'item-groceries',
		create_item({
			list_id: animationLabFixture.lowerListId,
			id: 'animation-lab-groceries',
			description: 'Pick up groceries'
		}),
		uid,
		seededAt + 4000
	);
	actionDocument(
		batch,
		animationLabFixture.lowerListId,
		'item-library',
		create_item({
			list_id: animationLabFixture.lowerListId,
			id: 'animation-lab-library',
			description: 'Return library books'
		}),
		uid,
		seededAt + 4100
	);

	const labelName = 'House';
	actionDocument(
		batch,
		animationLabFixture.labelId,
		'name',
		rename_list({ id: animationLabFixture.labelId, name: labelName }),
		uid,
		0
	);
	actionDocument(
		batch,
		animationLabFixture.labelId,
		'query',
		set_label_query({
			label_id: animationLabFixture.labelId,
			// Keep both navigation fixtures at the top level. The label exists so
			// Profile can exercise the real visibility editor, but it deliberately
			// matches no list in this fixture.
			query: { type: 'or', predicates: [{ type: 'id', id: animationLabFixture.labelId }] }
		}),
		uid,
		seededAt + 5000
	);
	batch.set(doc(firebase.firestore, 'from', uid, 'to', uid, 'requests', 'label'), {
		...create_label({ id: animationLabFixture.labelId, name: labelName }),
		creator: uid,
		creatorEmail: animationLabFixture.email,
		target: uid,
		timestamp: Timestamp.fromMillis(seededAt + 2000)
	});

	await batch.commit();
	return user;
}
