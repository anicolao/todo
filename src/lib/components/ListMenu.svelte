<script lang="ts">
	console.log('ListMenu.svelte');
	import { store } from '$lib/store';
	import List from '@smui/list';
	import ListMenuItem from './ListMenuItem.svelte';
</script>

<List>
	{#each $store.lists.visibleLists as listId}
		<ListMenuItem {listId} />
	{/each}
</List>
