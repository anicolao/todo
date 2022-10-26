<script>
	import { store } from '$lib/store';
	import IconButton from '@smui/icon-button';
</script>

{#if $store.auth.signedIn}
	<img
		alt={$store.auth.name}
		src={$store.auth.photo}
		class:round={true}
		width="48"
		height="48"
		referrerpolicy="no-referrer"
	/>
{:else}
	<IconButton class="material-icons" aria-label="Avatar">account_circle</IconButton>
{/if}

<style>
	.round {
		border-radius: 50%;
	}
</style>
