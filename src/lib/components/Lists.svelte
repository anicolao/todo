<script lang="ts">
	import firebase from '$lib/firebase';
	import {
		accept_pending_share,
		accept_share,
		create_list,
		delete_list,
		rename_list
	} from '$lib/components/lists';
	import { store } from '$lib/store';
	import { collection, doc, onSnapshot, query, setDoc } from 'firebase/firestore';
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

	function getUserById(id: string) {
		let users = $store.users.users.filter(x => x.uid === id);
		return users[0];
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
					if (name === undefined) {
						// this one isn't our own list.-
						console.log(`No need to create actions for ${id}`)
						return;
					}
					return setDoc(doc(firebase.firestore, 'lists', id, 'actions', 'name'), {
						...rename_list({ id, name }),
						timestamp: 0
					});
				})
				.then(() => {
					console.log('Asking for actions for new list.');
					const actions = collection(firebase.firestore, 'lists', id, 'actions');
					let unsubscribe = onSnapshot(query(actions), (querySnapshot) => {
						querySnapshot.docChanges().forEach((change) => {
							if (change.type === 'added') {
								let doc = change.doc;
								console.log(doc.data());
								store.dispatch(doc.data());
							}
						});
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

	function shareList(listId: string, name: string, uid: string) {
		return () => firebase.request(uid, accept_share({id: listId, name}));
	}

	function acceptPendingShare(listId: string) {
		return () => firebase.dispatch(accept_pending_share(listId));
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
						<button on:click={shareList(listId, $store.lists.listIdToList[listId], user.uid)}>Share list with {user.name}.</button>
					{/if}
				{/each}
			</p>
			<button on:click={deleteList(listId)}>Trash</button>
		</li>
	{/each}
</ul>

<ul>
	{#each $store.lists.pendingShares as {id, name, creatorId} }
		<li>
			<button on:click={acceptPendingShare(id)}>Accept share of '{name}' from {getUserById(creatorId).name}</button>
		</li>
	{/each}
</ul>

{#if errorMessage}
	<p>{errorMessage}</p>
{/if}
