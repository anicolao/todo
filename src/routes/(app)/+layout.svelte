<script lang="ts">
	console.log('routes/(app)/+layout.svelte');
	import { goto } from '$app/navigation';
	import AcceptShare from '$lib/components/AcceptShare.svelte';
	import { dispatch } from '$lib/components/ActionLog';
	import Avatar from '$lib/components/Avatar.svelte';
	import ListMenu from '$lib/components/ListMenu.svelte';
	import {
		create_list,
		delete_list,
		register_pending_share,
		rename_list
	} from '$lib/components/lists';
	import SgDialog from '$lib/components/SgDialog.svelte';
	import { show_edit_dialog } from '$lib/components/ui';
	import { add_user, emailToUid } from '$lib/components/users';
	import firebase from '$lib/firebase';
	import { store } from '$lib/store';
	import type { AnyAction } from '@reduxjs/toolkit';
	import Button, { Label } from '@smui/button';
	import { Actions } from '@smui/dialog';
	import Drawer, { AppContent, Content, Header, Scrim, Subtitle } from '@smui/drawer';
	import IconButton, { Icon } from '@smui/icon-button';
	import List, { Graphic, Item, Subheader, Text } from '@smui/list';
	import Paper from '@smui/paper';
	import Textfield from '@smui/textfield';
	import TopAppBar, { AutoAdjust, Row, Section, Title } from '@smui/top-app-bar';
	import {
		collection,
		collectionGroup,
		onSnapshot,
		orderBy,
		query,
		where,
		type Unsubscribe
	} from 'firebase/firestore';
	import { onDestroy } from 'svelte';
	import ShareList from './ShareList.svelte';

	let count = 0;
	onDestroy(() => {
		console.log('Destroyed with count ', { count });
	});

	let unsubscribeActions: Unsubscribe | undefined = undefined;
	let unsubscribeUsers: Unsubscribe | undefined = undefined;
	console.log('(app)/+layout.svelte init');
	console.log('(app)/+layout.svelte loaded', { unsubscribeActions, unsubscribeUsers, count });
	$: if ($store.auth.signedIn) {
		console.log('WE ARE SIGNED IN ', count++);
		if (unsubscribeUsers === undefined) {
			const user = $store.auth;
			if (user.uid) {
				const users = collection(firebase.firestore, 'users');
				unsubscribeUsers = onSnapshot(query(users), (querySnapshot) => {
					querySnapshot.docChanges().forEach((change) => {
						if (change.type === 'added') {
							let doc = change.doc;
							console.log(doc.data());
							store.dispatch(add_user(doc.data()));
						}
					});
				});

				console.log('SUBSCRIBE to actions');
				const actions = collectionGroup(firebase.firestore, 'requests');
				const q = query(actions, where('target', '==', user.uid), orderBy('timestamp'));
				console.log('Subscribing to actions for you', unsubscribeActions);
				unsubscribeActions = onSnapshot(q, (querySnapshot) => {
					querySnapshot.docChanges().forEach((change) => {
						if (change.type === 'added') {
							let doc = change.doc;
							let data = { ...doc.data() };
							if (data.timestamp) {
								console.log('server side data: ', data);
								data.timestamp = data.timestamp.seconds;
							} else {
								console.log('client side data: ', data);
							}
							store.dispatch(data as AnyAction);
						}
					});
				});
			}
		}
	} else {
		console.log('WE ARE *not* SIGNED IN');
		if (!$store.auth.signedIn) {
			cleanupSubscriptions();
		}
	}
	function cleanupSubscriptions() {
		console.log('CLEANING UP');
		if (unsubscribeUsers) {
			unsubscribeUsers();
			console.log('UN SUBSCRIBED to users');
			unsubscribeUsers = undefined;
		}
		if (unsubscribeActions) {
			unsubscribeActions();
			console.log('UN SUBSCRIBED to actions');
			unsubscribeActions = undefined;
		}
	}
	onDestroy(cleanupSubscriptions);

	let width = 0;
	const MOBILE_LAYOUT_WIDTH = 720;

	$: drawerOpen = width > MOBILE_LAYOUT_WIDTH;
	let topAppBar;

	let active: string;
	function setActive(name: string) {
		active = name;
		goto('/profile');
	}

	function getIconName(name: string) {
		return name;
	}
	function textLookup(text: string) {
		const i18n: { [k: string]: string } = {
			account_circle: 'Profile'
		};
		return i18n[text];
	}

	let newListName = '';

	function handleEnterKey(e: CustomEvent | KeyboardEvent) {
		e = e as KeyboardEvent;
		if (e.key === 'Enter') {
			createList(newListName);
			newListName = '';
		}
	}

	function createList(name: string) {
		const id = crypto.randomUUID();
		firebase.dispatch(create_list({ id, name }));
	}

	$: dialogOpen = $store.ui.showEditDialog;
	$: listName = '';
	$: if ($store.ui.title && !dialogOpen) {
		if (listName !== $store.ui.title) listName = $store.ui.title;
	}

	function mapEmailToUid(email: string): string {
		return emailToUid($store.users, email);
	}
	function closeDialog() {
		const uid = $store.auth.uid;
		const id = $store.ui.listId;
		const name = listName;
		if (uid) {
			if (listName !== $store.ui.title) {
				const action = rename_list({ id, name });
				dispatch('lists', id, uid, action);
			}
			const newShares = selectedShareUsers.filter((x) => true).map(mapEmailToUid);
			newShares.forEach((shareWith) => {
				if (shareWith) {
					firebase.request(shareWith, register_pending_share({ id, name }));
				}
			});
		}
		store.dispatch(show_edit_dialog(false));
	}
	function cancelDialog() {
		store.dispatch(show_edit_dialog(false));
	}

	function deleteList() {
		const id = $store.ui.listId;
		const uid = $store.auth.uid;
		if (uid) {
			dispatch('lists', id, uid, delete_list(id));
		}
		store.dispatch(show_edit_dialog(false));
		const remainingLists = $store.lists.visibleLists.filter((x: string) => x !== id);
		if (remainingLists.length == 0) {
			goto('/profile');
		} else {
			goto('/lists?listId=' + remainingLists[0]);
		}
	}

	$: bgUrl = $store?.uiSettings?.backgroundUrl;
	$: bgStyle = bgUrl ? `url(${bgUrl})` : '';

	let selectedShareUsers: string[] = [];
</script>

<svelte:window bind:innerWidth={width} />

<div class="drawer-container">
	<TopAppBar bind:this={topAppBar} variant="fixed">
		<Row>
			<div class={width > MOBILE_LAYOUT_WIDTH ? 'desk-margin' : 'mobile-margin'}>
				<Section>
					{#if width <= MOBILE_LAYOUT_WIDTH}
						<IconButton
							class="material-icons"
							on:click={() => (drawerOpen = !drawerOpen || width > MOBILE_LAYOUT_WIDTH)}
							>menu</IconButton
						>
					{/if}
					<IconButton class="material-icons">{$store.ui.icon}</IconButton><Title
						>{$store.ui.title}</Title
					>
				</Section>
			</div>
			<Section align="end" toolbar>
				<span><Avatar name={$store.auth.name} photo={$store.auth.photo} /></span>
			</Section>
		</Row>
	</TopAppBar>

	<AutoAdjust {topAppBar} />

	<Drawer
		variant={width > MOBILE_LAYOUT_WIDTH ? undefined : 'modal'}
		fixed={width > MOBILE_LAYOUT_WIDTH ? undefined : false}
		bind:open={drawerOpen}
	>
		<Header>
			<Title>Todo menu title</Title>
			<Subtitle>Organize your todos</Subtitle>
		</Header>
		<Content>
			<ListMenu />
			<div class="verticalspacer" />
			<AcceptShare />
			<Textfield
				style="width: 100%; min-height: 55px;"
				bind:value={newListName}
				label="New list"
				on:keydown={handleEnterKey}
				><Icon class="material-icons" slot="leadingIcon">add</Icon></Textfield
			>
			<List>
				<Subheader>Settings</Subheader>
				<Item
					href="javascript:void(0)"
					on:click={() => setActive('account_circle')}
					activated={active === 'account_circle'}
				>
					<Graphic class="material-icons" aria-hidden="true"
						>{getIconName('account_circle')}</Graphic
					>
					<Text>{textLookup('account_circle')}</Text>
				</Item>
			</List>
		</Content>
	</Drawer>

	<Scrim fixed={false} />
	<AppContent class="app-content">
		<div style:background-image={bgStyle} style:background-size="cover" style:width="100%">
			<slot />
			<SgDialog
				bind:open={dialogOpen}
				{cancelDialog}
				labelledby="editlist-dialog-title"
				describedby="editlist-dialog-content"
			>
				<!-- Title cannot contain leading whitespace due to mdc-typography-baseline-top() -->
				<div class="editlist-dialog-title-div">
					<Title id="editlist-dialog-title">Edit List</Title>
				</div>
				<Content id="editlist-dialog-content">
					<div class="editlist-dialog-content-div">
						<Paper variant="unelevated">
							<Textfield bind:value={listName} label="Name" />
						</Paper>
						<Paper variant="unelevated"
							><Subtitle>Share with:</Subtitle>
							<ShareList bind:selected={selectedShareUsers} />
						</Paper>
					</div>
				</Content>
				<Actions>
					<IconButton on:click={deleteList} class="material-icons">delete</IconButton>
					<Button on:click={cancelDialog}>
						<Label>Cancel</Label>
					</Button>
					<Button on:click={closeDialog}>
						<Label>Done</Label>
					</Button>
				</Actions>
			</SgDialog>
		</div>
	</AppContent>
</div>

<style>
	:global(.mdc-drawer__content) {
		display: flex;
		flex-direction: column;
	}
	.verticalspacer {
		display: flex;
		flex: 1;
	}
	/* Hide everything above this component. */
	:global(app),
	:global(body),
	:global(html) {
		display: block !important;
		height: auto !important;
		width: auto !important;
		position: static !important;
		margin: 0;
		padding: 0;
	}

	.drawer-container {
		position: relative;
		display: flex;
		height: 100vh;
		max-width: 100vw;
		border: 1px solid var(--mdc-theme-text-hint-on-background, rgba(0, 0, 0, 0.1));
		overflow: hidden;
		z-index: 0;
		flex-grow: 1;
	}

	* :global(.app-content) {
		flex: auto;
		overflow: auto;
		position: relative;
		flex-grow: 1;

		margin-top: 64px;
		display: flex;
		padding: 0;
	}

	.mobile-margin {
		margin-left: 0;
	}
	.desk-margin {
		margin-left: 256px;
	}
	.editlist-dialog-content-div {
		padding-left: 0.5em;
		padding-right: 0.5em;
	}

	.editlist-dialog-title-div {
		padding-top: 0.75em;
	}
</style>
