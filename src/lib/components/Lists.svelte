<script lang="ts">
	import firebase from '$lib/firebase';
	import { accept_share, create_list, delete_list, rename_list } from '$lib/components/lists';
	import { store } from '$lib/store';
	import { collection, doc, setDoc } from 'firebase/firestore';
	import { users } from './users';

	let errorMessage: string;

	let listName: string | undefined;

	function createNewList(event: any) {
		errorMessage = '';
		const name = event.srcElement.value;
		const id = crypto.randomUUID();
		firebase.dispatch(create_list({ id, name }));
		listName = undefined;
	}

	$: latestListCount = $store.lists.visibleLists.length;
	let lastListCount = 0;
	$: if (latestListCount > lastListCount) {
		let numNewLists = latestListCount - lastListCount;
		for (let i = 0; i < numNewLists; ++i) {
			const user = store.getState().auth;
			const id = $store.lists.visibleLists[i];
			const name = $store.lists.listIdToList[id];
			console.log('Create new list for ', id);
			setDoc(doc(firebase.firestore, 'editors', id, user.uid, 'editor'), { email: user.email })
				.then(() => {
					console.log('Create new actions for ', id);
					return setDoc(doc(firebase.firestore, 'lists', id, 'actions', 'name'), {
						...rename_list({ id, name }),
						timestamp: 0
					});
				})
				.catch((message) => {
					console.error(message);
				});
		}
		lastListCount = latestListCount;
	}

	function renameList(listId: string) {
		return (event: any) =>
			firebase.dispatch(rename_list({ id: listId, name: event.srcElement.value }));
	}

	function deleteList(listId: string) {
		return () => firebase.dispatch(delete_list(listId));
	}

	function shareList(listId: string, uid: string) {
		return () => firebase.request(uid, accept_share(listId));
	}
</script>

<label for="newListInput">New List:</label>
<input
	type="text"
	id="newListInput"
	bind:value={listName}
	placeholder="list name"
	on:change={createNewList}
/>
<ul>
	{#each $store.lists.visibleLists as listId}
		<li>
			<input type="text" value={$store.lists.listIdToList[listId]} on:change={renameList(listId)} />
			<p>
				{#each $store.users.users.filter((u) => u.uid != $store.auth.uid) as user}
					{#if user.uid}
						<button on:click={shareList(listId, user.uid)}>Share list with {user.name}.</button>
					{/if}
				{/each}
			</p>
			<button on:click={deleteList(listId)}>Trash</button>
		</li>
	{/each}
</ul>

{#if errorMessage}
	<p>{errorMessage}</p>
{/if}
