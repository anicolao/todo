<script>
	console.log('Avatar.svelte');
	import IconButton from '@smui/icon-button';
	import Graphic from '@smui/list/src/Graphic.svelte';

	export let name = '';
	export let photo = '';
</script>

{#if name}
	{#if photo}
		<img alt={name} src={photo} width="48" height="48" referrerpolicy="no-referrer" />
	{:else}
		<Graphic
			style="background-image: url(https://place-hold.it/43x38?text={name
				.split(' ')
				.map((val) => val.substring(0, 1))
				.join('')}&fontsize=16);"
		/>
	{/if}
{:else}
	<IconButton class="material-icons" aria-label="Avatar">account_circle</IconButton>
{/if}

<style>
	img {
		border-radius: 50%;
		margin-right: 1em;
	}
</style>
