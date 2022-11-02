<script lang="ts">
	import { goto } from '$app/navigation';
	import { store } from '$lib/store';

	console.log('routes/+layout.svelte init');
	$: if (!$store.auth.signedIn) {
		goto('/login');
	}
</script>

<slot />
