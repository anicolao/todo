<script lang="ts">
	console.log('ShareList.svelte');
	import type { AuthState } from '$lib/components/auth';
	import Avatar from '$lib/components/Avatar.svelte';
	import { shareAccepted, sharePending } from '$lib/components/users';
	import { store } from '$lib/store';
	import Checkbox from '@smui/checkbox';
	import { Icon } from '@smui/icon-button';
	import List, { Item, Meta, PrimaryText, SecondaryText, Text } from '@smui/list';
	import { PhoneMultiFactorGenerator } from 'firebase/auth';

	$: otherUsers = $store.users.users.filter((u: AuthState) => u.email !== $store.auth.email);
	export let selected: string[];

	function updateUserList(e: CustomEvent) {
		const t = e.target as unknown as { value: string; checked: boolean };
		console.log(t.value, t.checked);
		selected = selected.filter((x) => x !== t.value);
		if (t.checked) {
			selected.push(t.value);
		}
	}

	function name(user: AuthState) {
		return user.name || "Unknown Name";
	}
	function email(user: AuthState) {
		return user.name || "unknown@gmail.com";
	}
	function photo(user: AuthState) {
		return user.photo || "";
	}

	// Official material icons: https://fonts.google.com/icons?icon.query=table_bar&icon.set=Material+Icons
</script>

<div>
	<List twoLine avatarList>
		{#each otherUsers as user (user.email)}
			<Item>
				<Avatar name={name(user)} photo={photo(user)} />
				<Text>
					<PrimaryText>{user.name}</PrimaryText>
					<SecondaryText>{user.email}</SecondaryText>
				</Text>
				<Meta>
					{#if sharePending($store.users, email(user))}
						<Icon class="material-icons">sync</Icon>
					{:else}
						<Checkbox
							value={user.email}
							checked={shareAccepted($store.users, email(user))}
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
