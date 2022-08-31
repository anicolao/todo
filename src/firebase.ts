// Import the functions you need from the SDKs you need
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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

const firebase = {
	app: initializeApp(firebaseConfig),
	auth: getAuth(),
	google_auth_provider: new GoogleAuthProvider(),
	firestore: getFirestore()
};

export default firebase;
