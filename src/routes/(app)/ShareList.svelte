<script lang="ts">
	import type { AuthState } from '$lib/components/auth';
	import Avatar from '$lib/components/Avatar.svelte';
	import { shareAccepted, sharePending } from '$lib/components/users';
	import { store } from '$lib/store';
	import Checkbox from '@smui/checkbox';
	import { Icon } from '@smui/icon-button';
	import List, { Item, Meta, PrimaryText, SecondaryText, Text } from '@smui/list';

	$: otherUsers = $store.users.users.filter((u: AuthState) => u.email !== $store.auth.email);
	export let selected: string[];

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

	function updateUserList(e: CustomEvent) {
		const t = e.target as unknown as { value: string; checked: boolean };
		console.log(t.value, t.checked);
		selected = selected.filter((x) => x !== t.value);
		if (t.checked) {
			selected.push(t.value);
		}
	}

	// Official material icons: https://fonts.google.com/icons?icon.query=table_bar&icon.set=Material+Icons
</script>

<div>
	<List twoLine avatarList>
		{#each otherUsers as user (user.email)}
			<Item>
				<Avatar name={user.name} photo={user.photo} />
				<Text>
					<PrimaryText>{user.name}</PrimaryText>
					<SecondaryText>{user.email}</SecondaryText>
				</Text>
				<Meta>
					{#if sharePending($store.users, user.email)}
						<Icon class="material-icons">sync</Icon>
					{:else}
						<Checkbox
							value={user.email}
							checked={shareAccepted($store.users, user.email)}
							on:change={updateUserList}
						/>
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
