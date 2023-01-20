<script lang="ts">
	console.log('UiSettings.svelte');
	import { set_background_url } from '$lib/components/UiSettings';
	import firebase from '$lib/firebase';
	import { store } from '$lib/store';
	import Paper from '@smui/paper';

	function setBackground(event: { currentTarget: HTMLInputElement }) {
		let imgUrl = event.currentTarget.value;
		firebase.dispatch(set_background_url(imgUrl));
	}
</script>

<div>
	<Paper style="opacity: 0.8;">
		<label for="url">Background image url:</label>
		<input
			type="url"
			id="url"
			placeholder="image URL"
			value={$store.uiSettings.backgroundUrl || ''}
			on:input={setBackground}
		/>
		{#if $store.uiSettings.backgroundUrl}
			<Paper elevation={24} style="padding: 1em; margin: 1em;">
				<img src={$store.uiSettings.backgroundUrl} alt="background for the app" height="300" />
			</Paper>
		{/if}
	</Paper>
</div>
