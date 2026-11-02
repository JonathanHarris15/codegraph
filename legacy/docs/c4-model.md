# The C4 model

Notes pulled from [c4model.com](https://c4model.com) on 2026-11-02, for
structuring codegraph. C4 is Simon Brown's; the site is CC-BY 4.0. Everything
down to "Where this touches codegraph" is a plain-English restatement of what
the site says, not a decision about codegraph.

C4 calls itself a developer-friendly way to diagram software architecture. It
is notation independent and tooling independent: it tells you *what* to draw
boxes around, not how the boxes must look. It came out of UML and the 4+1
model, simplified for teams who had given up on UML and gone back to ad-hoc
boxes and lines.

## The four abstractions

C4 is one hierarchy, four deep. A person uses a software system; a software
system is made of containers; a container is made of components; a component
is made of code.

**Person.** A human who uses the systems you build — actor, role, persona, or
a named individual.

**Software system.** The top of the hierarchy: a thing that delivers value to
its users, human or not. This covers both the system you are modelling and the
other systems it depends on or that depend on it. Usually one development team
builds, owns and can see inside it; often its code is one repository, and
often everything inside it deploys together. In many cases the boundary of a
software system is the boundary of a single team.

Deliberately *not* software systems: product domains, bounded contexts,
business capabilities, feature teams, tribes, squads. Organisational shapes are
not systems.

**Container.** A runtime boundary around code being executed or data being
stored. Nothing to do with Docker — the word was picked to say nothing about
how the thing is physically run.

Containers are: server-side web apps; client-side web apps running in a
browser; desktop apps; mobile apps; console apps, batch processes and
standalone programs with a main; a single serverless function; a database or
schema; a blob or content store; a file system or part of one; a single shell
script.

Not containers: JARs, assemblies, DLLs, modules. Those organise code inside an
application — they are not runtime things.

Notes C4 makes about containers:

- Deployment is a separate concern. One container can be run many ways: three
  web apps might share a Tomcat in development and get a server each in
  production.
- A server-side app that mostly serves HTML is one container. If it ships a
  real single-page app, that is two containers — two process spaces talking
  over a protocol.
- A hosted store (S3 bucket, RDS schema) is still your container, because you
  own and control the bucket or schema you made.
- A microservice owned by your team is modelled as a group of one or more
  containers. A service owned by another team is promoted to its own software
  system.
- "Container" is a generic word; rename it if your team needs to.

**Component.** A grouping of related functionality behind a well-defined
interface. In Java or C#, a collection of implementation classes behind an
interface. In C, a set of files in a directory. In JavaScript, a module of
objects and functions. In a functional language, a module grouping related
functions and types.

Components are **not** separately deployable. The container is the deployable
unit, and every component inside a container runs in the same process space.
How components are packaged — one per JAR, many per DLL — is a different
question.

**Code.** The language's own building blocks that make up a component:
classes, interfaces, enums, functions, objects.

## The diagrams

Four levels of zoom over the same structure, so you can tell a different story
to a different audience. You are not meant to use all four — only the ones that
earn their place. For each, C4 states scope, primary elements, supporting
elements, audience, and whether it recommends drawing it at all.

**1. System context.** Scope: a single software system. Primary: that system.
Supporting: the people and external systems directly connected to it, which
your team usually does not own. Audience: everybody, technical and not, inside
and outside the team. Recommended for every team.

**2. Container.** Scope: a single software system. Primary: the containers
inside it. Supporting: people and systems directly connected to those
containers. Audience: technical people inside and outside the team —
architects, developers, ops and support. Recommended for every team.

C4 says these two are enough for most teams.

**3. Component.** Scope: a single container. Primary: the components inside it.
Supporting: the other containers in the system, plus people and systems
directly connected to those components. Audience: architects and developers.
Not recommended by default — draw one only if it adds value, and consider
generating it automatically if it has to live a long time.

**4. Code.** Scope: a single component. Primary: the code elements inside it —
classes, interfaces, objects, functions, database tables. Audience: architects
and developers. Not recommended, especially as lasting documentation, because
an IDE can produce it on demand. If you do keep one, generate it, and only for
the most important or most complex components.

### The three supporting diagrams

**System landscape.** Scope: an enterprise, organisation or department. A
context diagram with no single system in focus — a map of all the systems in
that scope and the people around them. Audience: everybody. Recommended,
especially in bigger organisations, where it is the bridge to enterprise
architecture.

**Dynamic.** Scope: one feature, story or use case. Shows how elements of the
static model collaborate at runtime, numbered so the order is readable. You
choose the level: systems, containers or components. Audience: everybody. Use
sparingly, for genuinely complicated interactions.

**Deployment.** Scope: one or more software systems in a single deployment
environment (production, staging, development). Primary: deployment nodes,
software system instances and container instances. Supporting: infrastructure
nodes such as DNS, load balancers, firewalls. Audience: technical people,
including infrastructure and operations. Recommended.

- A **deployment node** is where an instance of a system or container runs:
  physical hardware, virtualised or cloud infrastructure, a containerised
  environment, or an execution environment such as a database or app server.
  Nodes nest.
- A **container instance** is one deployed occurrence of a container from the
  static model, placed on infrastructure in a particular environment.

## The rules that hold whatever notation you use

C4 prescribes no notation, but it does insist a diagram be readable on its own:

- Every element states its type: Person, Software System, Container, Component.
- Every element carries a short description of its key responsibilities, so it
  can be read at a glance.
- Every container and component states its technology explicitly.
- Every line is one direction. Information flowing both ways is two lines.
- Every line is labelled, and the label is specific. "Uses" is not a label.
- A line between containers states its technology or protocol.
- Every diagram has a title saying its type and scope, and a key.

On scale: when a diagram gets too big, split it into several diagrams at the
*same* level of abstraction, each telling part of one story. C4 notes this is
far easier with a modelling tool — one model, many views — than with a drawing
tool, at the cost of losing the single big picture.

What C4 explicitly leaves alone: business processes, state machines, domain and
data models, and anything about design process or team structure. It is static
structure only. It also fits badly with embedded firmware and heavily
customised products like SAP or Salesforce.

## Where this touches codegraph

Commentary, not C4. Nothing here is decided.

| C4 | codegraph today |
| --- | --- |
| Person | Role (plan-only) |
| Software system | — (the repo is assumed) |
| Container | Program (plan-only, not read from code) |
| Component | Module; also Page, Component, Design system |
| Code | File, and front-door names |
| System context diagram | — |
| Container diagram | — |
| Component diagram | the map |
| Code diagram | a card's files |
| Dynamic diagram | Feature with its triggers and uses wires |
| Deployment diagram | — |
| System landscape | — |

Three things fall out of that:

1. **codegraph's map is a C4 component diagram without a container around it.**
   C4 says a component diagram has a scope: one container. codegraph's map has
   no scope above the repo, which is why `docs/where-codegraph-is-going.md`
   records that nothing nests. Container is the missing level, and codegraph
   already has the word for it — Program — but only a plan can say it.
2. **The word "component" collides.** C4's component is codegraph's Module. The
   thing codegraph calls a Component is a piece of UI, which in C4 terms is
   also a component, inside a different container (the browser app). Worth
   settling in `CONTEXT.md` before borrowing more C4 vocabulary.
3. **C4's readability rules are checkable.** Type stated, description stated,
   technology stated on every container and component, labelled one-way
   relationships — codegraph already enforces the shape of most of that through
   tags and wires. The ones it does not yet enforce are description and
   technology.
