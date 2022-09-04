<script>
	import Login from '../components/Login.svelte';
	import { store } from '../store';
	import UiSettings from './UiSettings.svelte';
</script>

<h1>The All New TODO</h1>
<p>A hopefully simpler, more robust, TODO list app.</p>

{#if $store.auth.signedIn === true}
	<UiSettings />
{/if}

<Login />
