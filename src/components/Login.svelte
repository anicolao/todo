<script>
	import firebase from '../firebase';
	const auth = firebase.auth;
	const gAuthProvider = firebase.google_auth_provider;
	import { onAuthStateChanged } from 'firebase/auth';
	onAuthStateChanged(auth, (user) => {
		if (user) {
			const uid = user.uid;
			console.log('logged in', uid, user);
			// ...
		} else {
			console.log('logged out');
		}
	});
</script>
<b>You are currently logged out.</b>