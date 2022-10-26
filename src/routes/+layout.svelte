<script lang="ts">
	import { goto } from '$app/navigation';
	import { store } from '$lib/store';

	$: if (!$store.auth.signedIn) {
    goto("/login");
	}
</script>
<slot />
