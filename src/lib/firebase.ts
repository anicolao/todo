// Import the functions you need from the SDKs you need
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { store } from '$lib/store';
import {
	addDoc,
	collection,
	getFirestore,
	serverTimestamp,
	connectFirestoreEmulator
} from 'firebase/firestore';
import { outgoing_request } from './components/requests';
//import { getAnalytics } from 'firebase/analytics';
//
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
	apiKey: 'AIzaSyC7mMXhf0noyZ-0LTJwyRJLpJlX6b-7MqQ',
	authDomain: 'todo-firebase-1a740.firebaseapp.com',
	projectId: 'todo-firebase-1a740',
	storageBucket: 'todo-firebase-1a740.appspot.com',
	messagingSenderId: '847898271389',
	appId: '1:847898271389:web:d386e542429c9bd9033e74',
	measurementId: 'G-TM8YJTC4SX'
};

// Initialize Firebase
//const app = initializeApp(firebaseConfig);
//const analytics = getAnalytics(app);

function dispatch(action: any) {
	const user = store.getState().auth;
	if (user.uid) {
		addDoc(collection(firebase.firestore, 'from', user.uid, 'to', user.uid, 'requests'), {
			...action,
			creator: user.uid,
			target: user.uid,
			timestamp: serverTimestamp()
		}).catch((message) => {
			console.error(message);
		});
	}
}

function request(to: string, action: any) {
	const user = store.getState().auth;
	if (user.uid) {
		console.log('Share request ', action);
		console.log('to', to);
		addDoc(collection(firebase.firestore, 'from', user.uid, 'to', to, 'requests'), {
			...action,
			creator: user.uid,
			target: to,
			timestamp: serverTimestamp()
		})
			.then((docRef) => {
				const id = docRef.id;
				dispatch(outgoing_request({ id, uid: to, action }));
			})
			.catch((message) => {
				console.error(message);
			});
	}
}

const firebase = {
	app: initializeApp(firebaseConfig),
	auth: getAuth(),
	google_auth_provider: new GoogleAuthProvider(),
	firestore: getFirestore(),
	dispatch,
	request
};

if (!import.meta.env.PROD) {
	connectFirestoreEmulator(firebase.firestore, 'localhost', 8080);
}
export default firebase;
