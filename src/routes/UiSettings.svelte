<script lang="ts">
	import { store } from '../store';
	import { set_background_url } from './UiSettings';
	import firebase from '../firebase';
	import { addDoc, doc, collection, serverTimestamp } from 'firebase/firestore';

	let errorMessage: string;

	function setBackground(event: { srcElement: { value: any; }; }) {
		errorMessage = "";
		let imgUrl = event.srcElement.value;

		// if(isValidUrl(imgUrl)) {
		/*
		store.dispatch(
			backgroundUrlAction({
				backgroundUrl: imgUrl
			})
		);
		*/

		const user = $store.auth;
		if (user.uid) {
			addDoc(collection(firebase.firestore, 'visible', user.uid, 'actions'),
			 {...set_background_url(imgUrl), timestamp: serverTimestamp()})
			.catch((message) => {
				errorMessage = message;
			});
		}

		/*
		// Path: /visible/{uid}/ui/settings
		//          coll   doc coll  doc
		// TODO: Merge these settings with whatever is already there (there's a firebase way).
		setDoc(doc(firebase.firestore, 'visible', user.uid, 'ui', 'settings'), {
			name: user.email,  // TODO: probably remove this; just for debugging.
			backgroundUrl: imgUrl
		}).catch((message) => {
			errorMessage = message;
		});
		// }
		*/
	}

	let visible = false;

	function toggleVisible() {
		visible = !visible;
	}
</script>

<span
	style:font-size="1.5em"
	style:cursor=pointer
	on:click={toggleVisible}
>
⚙
</span>

{#if visible}
	<h3>Settings</h3>
	<label for="url">Background image url:</label>
	<input type="url" id="url" placeholder="image URL" value={$store.uiSettings.backgroundUrl} on:input={setBackground} />
	{#if $store.uiSettings.backgroundUrl}
		<img src={$store.uiSettings.backgroundUrl} alt="background for the app" />
	{/if}

	{#if errorMessage}
		<p>{errorMessage}</p>
	{/if}
{/if}
