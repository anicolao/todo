<script lang="ts">
	// console.log('ItemDisplay.svelte');
	import { dispatch } from '$lib/components/ActionLog';
	import RepeatingDate from '$lib/components/RepeatingDate.svelte';
	import {
		complete_item,
		describe_item,
		star_item,
		uncomplete_item,
		type TodoItem,
		complete_forever
	} from '$lib/components/items';
	import { store } from '$lib/store';
	import { createEventDispatcher } from 'svelte';
	import { set_current_item, set_current_listid, show_item_detail_dialog } from './ui';

	type ExtendedTodoItem = TodoItem & { id: string };

	export let item: ExtendedTodoItem;
	export let listId = '';
	export let showListName = false;
	export let enableUndo = false;

	let listName = '';
	$: if (listId !== '') {
		listName = $store.lists.listIdToList[listId];
		listName = listName.replaceAll(' ', '\u00a0');
	}

	const dispatchEvent = createEventDispatcher();

	function showEditDetailsDialog(list_id: string, id: string) {
		return () => {
			if ($store.auth.uid) {
				store.dispatch(set_current_listid(list_id));
				store.dispatch(set_current_item(id));
				store.dispatch(show_item_detail_dialog(true));
			}
		};
	}

	function star(list_id: string, id: string, starred: boolean) {
		return () => {
			if ($store.auth.uid) {
				dispatch(
					'lists',
					list_id,
					$store.auth.uid,
					star_item({ list_id, id, starred, star_timestamp: new Date().getTime() })
				);
			}
		};
	}

	function complete(list_id: string, id: string, completed: boolean) {
		return () => {
			if (completed) {
				// play completion sound
				const sound = new Audio('/completed.mp3');
				sound.play();
			}
			if ($store.auth.uid) {
				const completed_time = new Date().getTime();
				dispatch(
					'lists',
					list_id,
					$store.auth.uid,
					complete_item({ list_id, id, completed, completed_time })
				);
			}
		};
	}

	function completeForever(list_id: string, id: string) {
		return () => {
			if ($store.auth.uid) {
				const sound = new Audio('/completed.mp3');
				sound.play();
				const completed_time = new Date().getTime();
				dispatch(
					'lists',
					list_id,
					$store.auth.uid,
					complete_item({ list_id, id, completed: true, completed_time })
				);
				dispatch('lists', list_id, $store.auth.uid, complete_forever({ list_id, id }));
			}
		};
	}

	function uncomplete(list_id: string, id: string) {
		return () => {
			if ($store.auth.uid) {
				dispatch('lists', list_id, $store.auth.uid, uncomplete_item({ list_id, id }));
			}
		};
	}

	function handleEnterKey(e: KeyboardEvent | CustomEvent) {
		e = e as KeyboardEvent;
		if (e.key === 'Enter') {
			const target = e.target as HTMLInputElement;
			target.blur();
		}
	}

	function handleBlur(list_id: string, item: TodoItem & { id: string }) {
		return (e: any) => {
			dispatchEvent('blur', { originalEvent: e });
			if ($store.auth.uid) {
				const origItem = $store.items.listIdToListOfItems[list_id].itemIdToItem[item.id];
				const description = e.target.value || '';
				if (description !== origItem.description) {
					dispatch(
						'lists',
						list_id,
						$store.auth.uid,
						describe_item({
							list_id,
							id: item.id,
							orig_description: origItem.description,
							description
						})
					);
				}
			}
		};
	}
</script>

<div class="container {$store.uiSettings.density}">
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	{#if enableUndo}<span class="material-icons" on:click={uncomplete(listId, item.id)}>undo</span
		>{:else if item.completed}<span
			class="check material-icons"
			on:click={complete(listId, item.id, false)}>check_box</span
		>{:else}<span class="check material-icons" on:click={complete(listId, item.id, true)}
			>check_box_outline_blank</span
		>{/if}<input
		class="description"
		value={item.description}
		on:keydown={handleEnterKey}
		on:blur={handleBlur(listId, item)}
		on:focus={(e) => dispatchEvent('focus', { originalEvent: e })}
	/>{#if !item.completed && item.dueDate && item.dueDate.repeats?.type !== 'none'}<!-- svelte-ignore a11y-click-events-have-key-events --><span
			class="star material-icons"
			on:click={completeForever(listId, item.id)}>highlight_off</span
		>{/if}<span class="itemInfo"
		><span class="repeatInfo"
			><RepeatingDate on:click={() => console.log('Clicked!')} dueDate={item.dueDate} /></span
		>{#if showListName}<span class="listName">{listName}</span>{/if}</span
	><!-- svelte-ignore a11y-click-events-have-key-events --><span
		on:click={showEditDetailsDialog(listId, item.id)}
		class="details material-icons">edit_note</span
	><!-- svelte-ignore a11y-click-events-have-key-events -->
	{#if item.starred}<span
			class="star material-icons"
			style="color: #ffb74d"
			on:click={star(listId, item.id, false)}>star</span
		>{:else}<span class="star material-icons" on:click={star(listId, item.id, true)}
			>star_outline</span
		>{/if}
</div>

<style>
	div {
		border-radius: 0.3em;
		margin: 0.25em;
		opacity: 0.9;
		border: 1px solid #4443;
		box-shadow: 0px 2px 1px -1px rgba(0, 0, 0, 0.2), 0px 1px 1px 0px rgba(0, 0, 0, 0.14),
			0px 1px 3px 0px rgba(0, 0, 0, 0.12);
		display: flex;
		background-color: #fafaf0;
	}
	.check {
		margin-left: 0.3em;
		margin-right: 0em;
		font-size: 100%;
	}
	.description:focus {
		outline-width: 0;
	}
	.description {
		display: inline-block;
		flex-grow: 1;
		border: none;
		line-height: 2em;
		max-height: 2em;
		overflow: hidden;
		background: transparent;
		margin: 0.2em;
		color: #000b;
		width: 1em;
	}
	.details {
		font-size: 100%;
	}
	.star {
		font-size: 100%;
	}
	span {
		color: #888a;
		margin: 0.1em;
		margin-left: -0.2em;
		margin-right: 0.5em;
		align-items: center;
		display: flex;
	}
	.itemInfo {
		display: block;
		color: var(--mdc-theme-primary, rgba(0, 0, 0, 0.7));
		font-size: 60%;
		line-height: 130%;
		flex-direction: column;
		align-items: end;
		justify-content: center;
		display: flex;
	}
	.repeatInfo {
		margin: 0;
		padding: 0;
		color: #000a;
	}
	.listName {
		margin: 0;
		padding: 0;
		color: #000a;
	}

	.low > .description {
		font-size: 100%;
	}
	.low > .star {
		font-size: 150%;
	}
	.low > .check {
		font-size: 150%;
		margin-right: 0.3em;
	}
	.low > .details {
		font-size: 150%;
		margin-right: 0.3em;
	}
	.low {
		padding: 0.3em;
		margin: 0.2em;
	}
</style>
