<script>
	console.log('(app)/+page.svelte');
	import { store } from '$lib/store';
	import { goto } from '$app/navigation';

	console.log('routes/(app)/+page.svelte');
	if ($store?.uiSettings?.currentUrl) {
		goto($store.uiSettings.currentUrl);
	} else {
		goto('/profile');
	}
</script>
