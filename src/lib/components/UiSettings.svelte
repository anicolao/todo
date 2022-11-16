<script lang="ts">
	console.log('UiSettings.svelte');
	import { set_background_url } from '$lib/components/UiSettings';
	import firebase from '$lib/firebase';
	import { store } from '$lib/store';
	import Paper, { Content } from '@smui/paper';

	function setBackground(event: { srcElement: { value: any } }) {
		let imgUrl = event.srcElement.value;
		firebase.dispatch(set_background_url(imgUrl));
	}
</script>

<div>
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
		<img src={$store.uiSettings.backgroundUrl} alt="background for the app" height="300" />
		<Paper variant="outlined">
			<Content>Hi Please This is where I'd like the image to go.</Content>
		</Paper>
	{/if}
</div>
