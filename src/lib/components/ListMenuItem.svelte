<script lang="ts">
	import { goto } from '$app/navigation';
	import { store } from '$lib/store';
	import { Item, Text, Graphic } from '@smui/list';
	import type { Unsubscribe } from 'firebase/firestore';
	import { onDestroy } from 'svelte';
	import { watch } from './ActionLog';
	import ListIcon from './ListIcon.svelte';

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
</script>

{#if listId}
	<Item href="javascript:void(0)" on:click={gotoList(listId)}>
		<ListIcon />
		<Text>{$store.lists.listIdToList[listId]}</Text>
	</Item>
{/if}
