const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());


function checkIsValidEdge(raw) {
  if (typeof raw !== "string")
    return false;

  let val = raw.trim();

  if (!/^[A-Z]->[A-Z]$/.test(val))
    return false;

  if (val[0] === val[3])
    return false;

  return true;
}

function generateUserId(name, dob) {
  if (!name || !dob)
    return "";

  const cleanName = String(name).toLowerCase().replace(/\s+/g, "");
  const parts = String(dob).split("/");

  if (parts.length !== 3)
    return cleanName;

  return `${cleanName}_${parts[0]}${parts[1]}${parts[2]}`;
}

function getInvalidEntry(item) {
  if (typeof item === "string")
    return item;

  if (item === null || item === undefined)
    return "";

  return String(item);
}

function getComponent(node, undirected, visitedGlobal) {
  const stack = [node];
  const component = [];

  visitedGlobal.add(node);

  while (stack.length > 0) {
    const current = stack.pop();
    component.push(current);

    for (let next of undirected[current] || []) {
      if (!visitedGlobal.has(next)) {
        visitedGlobal.add(next);
        stack.push(next);
      }
    }
  }

  return component;
}

function detectCycle(component, graph) {
  const visited = new Set();
  const visiting = new Set();
  const componentSet = new Set(component);

  function walk(node) {
    if (visiting.has(node))
      return true;

    if (visited.has(node))
      return false;

    visiting.add(node);

    for (let child of graph[node] || []) {
      if (componentSet.has(child) && walk(child))
        return true;
    }

    visiting.delete(node);
    visited.add(node);
    return false;
  }

  for (let node of component) {
    if (walk(node))
      return true;
  }

  return false;
}

function buildHierarchy(node, graph) {
  const tree = {};
  let depth = 1;

  for (let child of graph[node] || []) {
    const result = buildHierarchy(child, graph);
    tree[child] = result.tree;
    depth = Math.max(depth, result.depth + 1);
  }

  return { tree, depth };
}

app.post("/bfhl", (req, res) => {
  const {
    data = [],
    full_name = process.env.FULL_NAME || "john doe",
    email_id = process.env.EMAIL_ID || "john.doe@college.edu",
    college_roll_number = process.env.COLLEGE_ROLL_NUMBER || "21CS1001",
    dob = process.env.DOB || "17/09/1999"
  } = req.body || {};

  const valid = [];
  const invalid = [];
  const duplicates = [];

  const seen = new Set();
  const seenDuplicateEdges = new Set();
  const childParent = {};
  const graph = {};
  const undirected = {};
  const childSet = new Set();
  const nodes = new Set();

  const input = Array.isArray(data) ? data : [];

  for (let item of input) {
    if (!checkIsValidEdge(item)) {
      invalid.push(getInvalidEntry(item));
      continue;
    }

    const edge = item.trim();

    if (seen.has(edge)) {
      if (!seenDuplicateEdges.has(edge)) {
        duplicates.push(edge);
        seenDuplicateEdges.add(edge);
      }
      continue;
    }

    const [parent, child] = edge.split("->");

    seen.add(edge);

    if (childParent[child])
      continue;

    childParent[child] = parent;
    valid.push(edge);

    if (!graph[parent])
      graph[parent] = [];

    if (!graph[child])
      graph[child] = [];

    graph[parent].push(child);

    if (!undirected[parent])
      undirected[parent] = [];

    if (!undirected[child])
      undirected[child] = [];

    undirected[parent].push(child);
    undirected[child].push(parent);

    childSet.add(child);
    nodes.add(parent);
    nodes.add(child);
  }

  let hierarchies = [];
  let total_trees = 0;
  let total_cycles = 0;
  let maxDepth = 0;
  let largest_tree_root = "";

  const visitedGlobal = new Set();

  for (let node of nodes) {
    if (visitedGlobal.has(node))
      continue;

    const component = getComponent(node, undirected, visitedGlobal);
    const roots = component.filter((item) => !childSet.has(item)).sort();
    const root = roots.length > 0 ? roots[0] : [...component].sort()[0];

    if (detectCycle(component, graph)) {
      total_cycles++;
      hierarchies.push({
        root,
        tree: {},
        has_cycle: true
      });
      continue;
    }

    const result = buildHierarchy(root, graph);

    total_trees++;

    if (
      result.depth > maxDepth ||
      (result.depth === maxDepth && (largest_tree_root === "" || root < largest_tree_root))
    ) {
      maxDepth = result.depth;
      largest_tree_root = root;
    }

    hierarchies.push({
      root,
      tree: { [root]: result.tree },
      depth: result.depth
    });
  }

  return res.json({
    user_id: generateUserId(full_name, dob),
    email_id,
    college_roll_number,
    hierarchies,
    invalid_entries: invalid,
    duplicate_edges: duplicates,
    summary: {
      total_trees,
      total_cycles,
      largest_tree_root
    }
  });
});

app.get("/", (req, res) => {
  res.json({
    message: "BFHL API is live. Use POST /bfhl to send data."
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});