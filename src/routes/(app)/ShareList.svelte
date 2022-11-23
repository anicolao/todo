<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import { emailToUid, type UsersState } from '$lib/components/users';
	import { store } from '$lib/store';
	import Checkbox from '@smui/checkbox';
	import { Icon } from '@smui/icon-button';
	import List, { Item, Meta, PrimaryText, SecondaryText, Text } from '@smui/list';

	$: otherUsers = $store.users.users.filter((u) => u.email !== $store.auth.email);
	export let selected: string[] = [];

	function selectUser(email: string) {
		return () => {
			if (!sharePending($store.users, email)) {
				console.log('Selected: ' + email);
				const found = selected.indexOf(email);
				if (found !== -1) {
					selected.splice(found, 1);
				} else {
					selected.push(email);
				}
				selected = selected;
			}
		};
	}

	function sharePending(users: UsersState, email: string) {
		const uid = emailToUid(users, email);
		const pendingRequests = $store.requests.pendingRequests.filter(
			(id: string) =>
				$store.requests.requestIdToUid[id] === uid &&
				$store.requests.requestIdToRequest[id].payload.id === $store.ui.listId
		);
		return pendingRequests.length > 0;
	}

	// Official material icons: https://fonts.google.com/icons?icon.query=table_bar&icon.set=Material+Icons
</script>

<div>
	<List twoLine avatarList>
		{#each otherUsers as user (user.email)}
			<Item on:SMUI:action={selectUser(user.email)}>
				<Avatar name={user.name} photo={user.photo} />
				<Text>
					<PrimaryText>{user.name}</PrimaryText>
					<SecondaryText>{user.email}</SecondaryText>
				</Text>
				<Meta>
					{#if sharePending($store.users, user.email)}
						<Icon class="material-icons">sync</Icon>
					{:else}
						<Checkbox bind:group={selected} value={user.email} />
					{/if}
				</Meta>
			</Item>
		{/each}
	</List>
</div>

<!-- <p class="status">Selected: {selected.join(', ')}</p> -->
<style>
	div {
		max-height: 14em;
		overflow-y: auto;
	}
</style>
