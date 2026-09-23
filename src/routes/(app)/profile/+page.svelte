<script lang="ts">
	console.log('(app)/profile/+page.svelte');
	import ProfileSettings from '$lib/components/ProfileSettings.svelte';
	import { set_icon, set_title } from '$lib/components/ui';
	import { store } from '$lib/store';

	store.dispatch(set_icon('account_circle'));
	store.dispatch(set_title('Profile'));
</script>

<ProfileSettings />
