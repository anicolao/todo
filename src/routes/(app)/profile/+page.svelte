<script lang="ts">
	console.log('(app)/profile/+page.svelte');
	import Login from '$lib/components/Login.svelte';
	import { set_icon, set_title } from '$lib/components/ui';
	import UiSettings from '$lib/components/UiSettings.svelte';
	import { store } from '$lib/store';
	import Paper from '@smui/paper';

	store.dispatch(set_icon('account_circle'));
	store.dispatch(set_title('Profile'));
</script>

<div id="content">
	<UiSettings />

	<Paper style="margin-top: 2em; opacity: 0.8;">
		<Login />
	</Paper>
</div>

<style>
	#content {
		margin: 1em;
	}
</style>
