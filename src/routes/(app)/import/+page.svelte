<script lang="ts">
	console.log('routes/(app)/import/+page.svelte');
	import { create_list } from '$lib/components/lists';
	import firebase from '$lib/firebase';
	import { dispatch } from '$lib/components/ActionLog';
	import { store } from '$lib/store';
	import { create_item, type DueDate } from '$lib/components/items';
	import { complete_item, star_item, set_due_date } from '$lib/components/items';

	function importItem(listItem: any, list_id: string, id: string) {
		if ($store.auth.uid === null || $store.auth.uid === undefined) {
			console.error("Not logged in?!")
			return;
		}
		const completed = listItem.extendedProperties.shared.done;
		const starred = listItem.extendedProperties.shared.starred;
		const dueDate = listItem.extendedProperties.shared.dueDate;
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
		if (dueDate) {
			/*
		export interface DueDate {
			year: number; // 4-digit year, eg: 2022.
			month: number; // Month [1..12].
			day: number; // Day of month [1..31].
			repeats?: RepeatInfo;
		}

		export interface RepeatInfo {
			type: RepeatType;
			every: number;
		}

		export enum RepeatType {
			NONE = 'none',
			DAILY = 'daily', // every N day(s)
			WEEKLY = 'weekly', // on dayOfWeek (from 'due') AND every N weeks
			MONTHLY = 'monthly', // on day N (from 'due')    AND every N months
			YEARLY = 'yearly', // on Month Day (Jan 1 .. Jan 31, Dec 1 .. Dec 31)
			WEEKDAYS = 'weekdays'
		}
		*/

			const split = dueDate.split('-').map((x: string) => parseInt(x));
			const due_date: DueDate = {
				year: split[0],
				month: split[1],
				day: split[2]
			};

			const repeats = listItem.extendedProperties.shared.repeats;
			if (repeats) {
				const every = +listItem.extendedProperties.shared.repeatInterval || 1;
				due_date.repeats = {
					type: repeats,
					every
				};
			}

			dispatch('lists', list_id, $store.auth.uid, set_due_date({ list_id, id, due_date }));
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
				complete_item({ list_id, id, completed, completed_time, description })
			);
		}
	}
	function importList(listData: any, listId: string) {
		const listName = listData.listMetadata.summary.replace(/^TODO: /, '');
		firebase.dispatch(create_list({ id: listId, name: listName })).then(() => {
			console.log(`Importing list ${listName}`);
			const todos = listData.todos;
			const anchor = listData.anchor_id;
			const missedTodos = { ...todos };
			delete missedTodos[anchor];
			let current = todos[anchor].extendedProperties.shared.prev;
			let count = 0;
			while (current !== anchor) {
				importItem(todos[current], listId, current);
				delete missedTodos[current];
				++count;
				current = todos[current].extendedProperties.shared.prev;
			}
			const expected = Object.keys(todos).length - 1;
			if (count !== expected) {
				console.error(count + ' was not the expected length of ' + expected);
				for (let m in missedTodos) {
					missedTodos[m].description += ' LOST_ITEM';
					importItem(missedTodos[m], listId, m);
				}
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
