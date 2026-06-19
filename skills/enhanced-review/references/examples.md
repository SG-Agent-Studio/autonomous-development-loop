# Examples of Good Taste

## Eliminate the Special Case

Bad — head is a special case:
```typescript
function deleteNode(list: LinkedList, node: Node) {
  if (list.head === node) {
    list.head = node.next;
  } else {
    let prev = list.head;
    while (prev.next !== node) prev = prev.next;
    prev.next = node.next;
  }
}
```

Good — sentinel nodes remove the special case:
```typescript
function deleteNode(entry: NodeEntry) {
  entry.prev.next = entry.next;
  entry.next.prev = entry.prev;
}
```

## Just Do The Thing

Bad — over-engineered:
```typescript
class AbstractFactoryBuilderInterface {
  createBuilder(): BuilderFactory {
    return new ConcreteBuilderFactoryImpl();
  }
}
```

Good:
```typescript
function createUser(data: UserData): User {
  return { ...data, createdAt: Date.now() };
}
```

## Early Returns Over Deep Nesting

Bad — 5 levels deep:
```typescript
function processData(data: Data[]) {
  if (data) {
    if (data.length > 0) {
      for (const item of data) {
        if (item.valid) {
          if (item.type === 'special') { /* ... */ } else { /* ... */ }
        }
      }
    }
  }
}
```

Good:
```typescript
function processData(data: Data[]) {
  if (!data?.length) return;
  for (const item of data) {
    if (!item.valid) continue;
    item.type === 'special' ? handleSpecial(item) : handleNormal(item);
  }
}
```
