<script lang="ts">
	import { goto } from '$app/navigation';
	import { store } from '$lib/store';
	import { Item, Text, Graphic, Meta } from '@smui/list';
	import type { Unsubscribe } from 'firebase/firestore';
	import { onDestroy } from 'svelte';
	import { watch } from './ActionLog';
	import ListIcon from './ListIcon.svelte';
	import { page } from '$app/stores';
	import IconButton from '@smui/icon-button';
	import { show_edit_dialog } from './ui';

	$: pageListId = $page.url.searchParams.get('listId') || 'hmph';

	export let listId: string | undefined = undefined;
	let unsub: Unsubscribe | undefined;
	$: if (listId) {
		if (unsub) unsub();
		unsub = watch('lists', listId);
	}

	onDestroy(() => {
		if (unsub) unsub();
	});

	function gotoList(listId: string) {
		return () => goto(`/lists/?listId=${listId}`);
	}
	$: activated = pageListId === listId;
</script>

{#if listId}
	<Item href="javascript:void(0)" on:click={gotoList(listId)} {activated}>
		<ListIcon />
		<Text>{$store.lists.listIdToList[listId]}</Text>
		{#if activated}
			<Meta
				><IconButton class="material-icons" on:click={() => store.dispatch(show_edit_dialog(true))}
					>edit</IconButton
				></Meta
			>
		{/if}
	</Item>
{/if}
