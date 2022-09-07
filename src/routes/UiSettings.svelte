<script lang="ts">
	import { store } from '../store';
	import { set_background_url } from './UiSettings';
	import firebase from '../firebase';
	import { addDoc, doc, collection, serverTimestamp } from 'firebase/firestore';

	let errorMessage: string;

	function setBackground(event: { srcElement: { value: any } }) {
		errorMessage = '';
		let imgUrl = event.srcElement.value;
		firebase.dispatch(set_background_url(imgUrl));
	}

	let visible = false;

	function toggleVisible() {
		visible = !visible;
	}
</script>

<span style:font-size="1.5em" style:cursor="pointer" on:click={toggleVisible}> ⚙ </span>

{#if visible}
	<h3>Settings</h3>
	<label for="url">Background image url:</label>
	<input
		type="url"
		id="url"
		placeholder="image URL"
		value={$store.uiSettings.backgroundUrl}
		on:input={setBackground}
	/>
	{#if $store.uiSettings.backgroundUrl}
		<img src={$store.uiSettings.backgroundUrl} alt="background for the app" />
	{/if}

	{#if errorMessage}
		<p>{errorMessage}</p>
	{/if}
{/if}
