<script lang="ts">
	console.log('routes/(app)/profile/+page.svelte');
	import { set_icon, set_title } from '$lib/components/ui';
	import UiSettings from '$lib/components/UiSettings.svelte';
	import { store } from '$lib/store';

	store.dispatch(set_icon('account_circle'));
	store.dispatch(set_title('Profile'));
</script>

<div id="content">
	<UiSettings />

	<div id="userInfo">
		<img src={$store.auth.photo} referrerpolicy="no-referrer" alt={$store.auth.name} />
		<p>{$store.auth.email}</p>
		<p>{$store.auth.name}</p>
	</div>
</div>

<style>
	#content {
		margin: 1em;
	}
	#userInfo {
		margin-top: 2em;
	}
</style>
