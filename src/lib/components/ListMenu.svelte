<script lang="ts">
	import { goto } from '$app/navigation';
	import { store } from '$lib/store';
	import List, { Item, Text, Graphic, Separator, Subheader } from '@smui/list';

	function gotoList(listId: string) {
		return () => goto(`/lists/?listId=${listId}`);
	}
</script>

<List>
	{#each $store.lists.visibleLists as listId}
		<Item href="javascript:void(0)" on:click={gotoList(listId)}>
			<Graphic class="material-icons" aria-hidden="true">account_circle</Graphic>
			<Text>{$store.lists.listIdToList[listId]}</Text>
		</Item>
	{/each}
</List>
