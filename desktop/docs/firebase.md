# Connecting Firebase

Everything but the connection is built and tested against a folder standing in for
Firebase. This is what is left.

## What you do (about 20 minutes)

1. **Make the Firebase project**, and move it to the pay-as-you-go plan (Blaze). File
   storage needs it, so it needs a card on file. At two people I expect it to cost
   about $0 a month, and I'd set a budget alert to be sure.
2. **Make a GitHub OAuth App** (GitHub, Settings, Developer settings, OAuth Apps).
   - Tick **Enable Device Flow**.
   - Callback URL: the one Firebase shows in the next step.
3. **Turn on sign-in**: Firebase, Authentication, Sign-in method, GitHub. Paste the
   OAuth App's client ID and secret.
4. **Turn on three stores**, in the same region if you can:
   - Firestore: projects, sketches, layouts, history.
   - Realtime Database: cursors and held things.
   - Storage: mockups and history snapshots.
5. **Add a Web app** to the project, and copy its config.
6. **Give me**: that config, and the OAuth App's client ID. The secret stays in
   Firebase and never goes in the app.

If your repos sit in a GitHub organisation, its owner has to approve the OAuth App
once.

## What I do then (CG-7.10)

1. **Prove sign-in first.** The docs do not say whether Firebase takes a token from
   GitHub's device flow, or must see one from the same OAuth App, so test
   `signInWithCredential(GithubAuthProvider.credential(token))` on the real project
   before anything else. If it refuses, the fallback is a browser sign-in on a local
   port, which means shipping the client secret in the app.
2. **Write `src/modules/cloud/firebase.ts`**: the `Cloud` type in
   `src/modules/cloud/schema.ts`, and nothing else changes.

   | `Cloud` | Firebase |
   |---|---|
   | `signIn`, `signOut` | Auth, `signInWithCredential`, persisted in the main process |
   | `read`, `change` | Firestore `getDoc`, `runTransaction` |
   | `list`, `watch` | Firestore `getDocs`, `onSnapshot` on a collection |
   | `naming`, `watchNaming` | Firestore `where('memberIds', 'array-contains', id)` |
   | `putFile`, `getFile`, `removeFile` | Storage |
   | `room` | Realtime Database: `onDisconnect` frees people and held things; a transaction takes a hold |
   | `CloudOffline` | Firestore's `unavailable` error, and a timeout on `runTransaction`, which never fails fast offline |

3. **Install the SDK**, in the main process, which is where features run. Check it
   bundles there under electron-vite.
4. **Point the shell at it** in `src/main/index.ts`, replacing the folder, and put the
   client ID in `githubClientId` in the `machine` module.
5. **Deploy the rules** in `docs/firebase/`, and test them. They are drafts I have not
   run.
6. **Run it for real**: sign in on two computers, and work through "Check on the real
   thing" below.

## Things to watch when connecting

- **Who a member is.** Members are known by GitHub's number for the account (ADR
  0017), not Firebase's own user id, so a person can be invited before they first sign
  in. The rules read it from `request.auth.token.firebase.identities['github.com'][0]`.
- **Why two databases.** Cursors go in the Realtime Database not to save money, which
  is pennies either way at this size, but because it can tell when someone drops off.
  A card held by a laptop that dies mid-drag must free itself, and Firestore cannot do
  that.
- **Rooms need their own member list.** Realtime Database rules cannot read Firestore,
  so whoever changes a project's members also has to write them to
  `roomMembers/{room}`. Without this, anyone signed in could join any room. Do this in
  `change`, when the path is a project.
- **A document's limit is 1 MiB.** Very large sketches could reach it. Mockups and
  history snapshots are already files, for this reason, but a failed write has no words
  for the person yet.
- **Deleting a project** removes its documents one by one from the owner's computer.
  Firestore does not do it for you, so a dropped connection part way leaves some behind.

## Check on the real thing

The folder stands in faithfully, but it is not Firebase, and these need a person:

1. Sign in on two computers, one being a new account.
2. Invite by username, before the other person has ever signed in.
3. Watch cursors and a held card, and how quick they feel.
4. Close a laptop mid-drag: the card frees itself.
5. A repo the other person has no GitHub access to is greyed out.
6. Work offline, reconnect, and check both changes are in the history.
7. Rules: a viewer really cannot write, and a stranger really cannot read, even by
   going around the app.
