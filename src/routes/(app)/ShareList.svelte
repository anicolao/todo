<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	console.log('routes/(app)/+ShareList.svelte');
	import { store } from '$lib/store';
	import Checkbox from '@smui/checkbox';
	import List, { Graphic, Item, Meta, PrimaryText, SecondaryText, Text } from '@smui/list';

	$: otherUsers = $store.users.users.filter(u => u.email !== $store.auth.email);
	let selected: string[] = [];

	function selectUser(email: string) {
		return () => {
			console.log('Selected: ' + email);
			const found = selected.indexOf(email);
			if (found !== -1) {
				selected.splice(found, 1);
			} else {
				selected.push(email);
			}
			selected = selected;
		};
	}
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
					<Checkbox bind:group={selected} value={user.email} />
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
