<script lang="ts">
	import {
		collection,
		query,
		onSnapshot,
		where,
		type Unsubscribe,
		orderBy,
		collectionGroup
	} from 'firebase/firestore';
	import { store } from '$lib/store';
	import firebase from '$lib/firebase';
	import Login from '$lib/components/Login.svelte';
	import { add_user } from '$lib/components/users';
	import type { AnyAction } from '@reduxjs/toolkit';
	import Drawer, { AppContent, Content, Header, Subtitle, Scrim } from '@smui/drawer';
	import List, { Item, Text, Graphic, Separator, Subheader } from '@smui/list';
	import TopAppBar, { Row, Section, AutoAdjust, Title } from '@smui/top-app-bar';
	import IconButton from '@smui/icon-button';
	import Avatar from '$lib/components/Avatar.svelte';
	import ListMenu from '$lib/components/ListMenu.svelte';

	let unsubscribeActions: Unsubscribe | undefined = undefined;
	let unsubscribeUsers: Unsubscribe | undefined = undefined;
	console.log('(app)/+layout.svelte init');
	$: if ($store.auth.signedIn) {
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

				const actions = collectionGroup(firebase.firestore, 'requests');
				const q = query(actions, where('target', '==', user.uid), orderBy('timestamp'));
				console.log("Subscribing to actions for you", unsubscribeActions, this);
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
		} else if (!$store.auth.signedIn) {
			if (unsubscribeUsers) {
				console.log('layout.svelte: not signed in anymore, call unsubscribeUsers()');
				unsubscribeUsers();
				unsubscribeUsers = undefined;
			}
			if (unsubscribeActions) {
				console.log('layout.svelte: not signed in anymore, call unsubscribeActions()');
				unsubscribeActions();
				unsubscribeActions = undefined;
			}
		}
	}

	let width = 0;
	const MOBILE_LAYOUT_WIDTH = 720;

	$: drawerOpen = width > MOBILE_LAYOUT_WIDTH;
	let topAppBar;

	let active: string;
	function setActive(name: string) {}
	function getIconName(name: string) {
		return 'iconName ' + name;
	}
	function textLookup(text: string) {
		return 'textLookup ' + text;
	}
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
					<Title>Page Title</Title>
				</Section>
			</div>
			<Section align="end" toolbar>
				<span><Avatar /></span>
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

			<List>
				<Separator />
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
		<slot />
	</AppContent>
</div>

<style>
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
</style>
