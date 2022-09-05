<script>
	import { store } from '../store';
	import { backgroundUrlAction } from './UiSettings';
	import firebase from '../firebase';
	import { setDoc, doc } from 'firebase/firestore';

	/**
	 * @type {string}
	 */
	let errorMessage;

	/**
	 * @param {any} event
	 */
	function setBackground(event) {
		errorMessage = "";
		let imgUrl = event.srcElement.value;

		// if(isValidUrl(imgUrl)) {
		store.dispatch(
			backgroundUrlAction({
				backgroundUrl: imgUrl
			})
		);

		// Path: /visible/{uid}/ui/settings
		//          coll   doc coll  doc
		const user = $store.auth;
		// TODO: Merge these settings with whatever is already there (there's a firebase way).
		setDoc(doc(firebase.firestore, 'visible', user.uid, 'ui', 'settings'), {
			name: user.email,  // TODO: probably remove this; just for debugging.
			backgroundUrl: imgUrl
		}).catch((message) => {
			errorMessage = message;
		});
		// }
	}
</script>

<h3>Settings</h3>
<label for="url">Background image url:</label>
<input type="url" id="url" placeholder="image URL" on:input={setBackground} />
{#if $store.uiSettings.backgroundUrl}
	<img src={$store.uiSettings.backgroundUrl} alt="background for the app" />
{/if}

	{#if errorMessage}
		<p>{errorMessage}</p>
	{/if}
{/if}
