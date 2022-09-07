<script>
	import Login from '$lib/components/Login.svelte';
	import { store } from '$lib/store';
	import UiSettings from '$lib/components/UiSettings.svelte';
</script>

<h1>The All New TODO</h1>
<p>A hopefully simpler, more robust, TODO list app.</p>

{#if $store.auth.signedIn === true}
	<UiSettings />
{/if}

<Login />
