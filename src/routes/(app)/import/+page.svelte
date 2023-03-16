<script lang="ts">
	console.log('routes/(app)/import/+page.svelte');
	import { create_list } from '$lib/components/lists';
	import firebase from '$lib/firebase';
	import { dispatch } from '$lib/components/ActionLog';
	import { store } from '$lib/store';
	import { create_item } from '$lib/components/items';
	import { complete_item, star_item } from '$lib/components/items';

	function importItem(listItem: any, list_id: string, id: string) {
		const completed = listItem.extendedProperties.shared.done;
		const starred = listItem.extendedProperties.shared.starred;
		const description = listItem.description;
		if (!description) {
			console.error(`List Item: ${listItem.description} ${completed}`);
			console.error('create_item', { list_id, id, description });
			return;
		}
		dispatch('lists', list_id, $store.auth.uid, create_item({ list_id, id, description }));
		if (starred) {
			let star_timestamp = listItem.extendedProperties.shared.timestamps.starred;
			if (!star_timestamp) {
				console.error(`no star timestamp for item ${description}`);
				star_timestamp = new Date().getTime();
				console.log('star_item', { list_id, id, starred, star_timestamp });
			}
			dispatch(
				'lists',
				list_id,
				$store.auth.uid,
				star_item({ list_id, id, starred, star_timestamp })
			);
		}
		if (completed) {
			let completed_time = listItem.extendedProperties.shared.timestamps.done;
			if (!completed_time) {
				console.error(`no completed timestamp for item ${description}`);
				completed_time = new Date().getTime();
				console.log('complete_item', { list_id, id, completed, completed_time });
			}
			dispatch(
				'lists',
				list_id,
				$store.auth.uid,
				complete_item({ list_id, id, completed, completed_time })
			);
		}
	}
	function importList(listData: any, listId: string) {
		const listName = listData.listMetadata.summary.replace(/^TODO: /, '');
		firebase.dispatch(create_list({ id: listId, name: listName })).then(() => {
			console.log(`Importing list ${listName}`);
			const todos = listData.todos;
			const anchor = listData.anchor_id;
			let current = todos[anchor].extendedProperties.shared.next;
			while (current !== anchor) {
				importItem(todos[current], listId, current);
				current = todos[current].extendedProperties.shared.next;
			}
		});
	}

	function doImport(e: any) {
		console.log('do the thing.', e);
		const json = e.target.value;
		const parsed = JSON.parse(json);
		const users: string[] = [];
		Object.keys(parsed).forEach((k) => {
			if (k.indexOf('@gmail') !== -1) {
				users.push(k);
			}
		});
		for (let i = 0; i < users.length; ++i) {
			const user = users[i];
			console.log(`Import lists for ${user}`);
			const allLists = parsed[user]['AllLists'];
			for (let li = 0; li < allLists.length; ++li) {
				const listId = allLists[li];
				importList(parsed[user][listId], listId);
				delete parsed[user][listId];
			}
			Object.keys(parsed[user]).forEach((listId) => {
				console.log(`Found list id ${listId}`);
			});
		}
	}
</script>

<div>
	Primitive import tool.
	<p>
		<textarea on:change={doImport} />
	</p>
</div>

<style>
	textarea {
		margin: 5%;
		width: 80%;
		height: 400px;
	}
	div {
		width: 100%;
	}
</style>
