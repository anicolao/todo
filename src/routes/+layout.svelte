<script lang="ts">
	console.log('src/routes/+layout.svelte');
	import { goto } from '$app/navigation';
	import { store } from '$lib/store';

	$: if ($store.auth.signedIn === false) {
		console.log('...redirect to /login', {'signedIn?': $store.auth.signedIn});
		goto('/login');
	}
</script>

<slot />
