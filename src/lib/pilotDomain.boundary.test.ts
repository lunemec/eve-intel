import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function isUsePilotIntelPipelineModuleSpecifier(moduleSpecifier: string): boolean {
  const normalizedSpecifier = moduleSpecifier.replace(/\\/g, "/");
  const extensionlessSpecifier = normalizedSpecifier.replace(/\.[cm]?tsx?$/, "");
  return (
    extensionlessSpecifier === "usePilotIntelPipeline" ||
    extensionlessSpecifier.endsWith("/usePilotIntelPipeline")
  );
}

function entityNameContainsPilotCard(entityName: ts.EntityName): boolean {
  if (ts.isIdentifier(entityName)) {
    return entityName.text === "PilotCard";
  }
  return (
    entityName.right.text === "PilotCard" || entityNameContainsPilotCard(entityName.left)
  );
}

function isPilotCardStringLikeLiteral(literal: ts.Node): boolean {
  return (
    (ts.isStringLiteral(literal) || ts.isNoSubstitutionTemplateLiteral(literal)) &&
    literal.text === "PilotCard"
  );
}

function unwrapParenthesizedTypeNode(typeNode: ts.TypeNode): ts.TypeNode {
  let currentTypeNode = typeNode;
  while (ts.isParenthesizedTypeNode(currentTypeNode)) {
    currentTypeNode = currentTypeNode.type;
  }
  return currentTypeNode;
}

function importTypeReferencesPilotCard(importTypeNode: ts.ImportTypeNode): boolean {
  const argument = importTypeNode.argument;
  if (!ts.isLiteralTypeNode(argument) || !ts.isStringLiteral(argument.literal)) {
    return false;
  }
  if (!isUsePilotIntelPipelineModuleSpecifier(argument.literal.text)) {
    return false;
  }
  const qualifier = importTypeNode.qualifier;
  if (qualifier && entityNameContainsPilotCard(qualifier)) {
    return true;
  }
  const directParent = importTypeNode.parent;
  const indexedAccessParent =
    directParent && ts.isIndexedAccessTypeNode(directParent)
      ? directParent
      : directParent &&
          ts.isParenthesizedTypeNode(directParent) &&
          directParent.parent &&
          ts.isIndexedAccessTypeNode(directParent.parent)
        ? directParent.parent
        : undefined;

  if (
    indexedAccessParent &&
    unwrapParenthesizedTypeNode(indexedAccessParent.objectType) === importTypeNode
  ) {
    const indexType = indexedAccessParent.indexType;
    return ts.isLiteralTypeNode(indexType) && isPilotCardStringLikeLiteral(indexType.literal);
  }
  return false;
}

function importsPilotCardFromUsePilotIntelPipeline(sourceText: string): boolean {
  const sourceFile = ts.createSourceFile(
    "pilot-domain-boundary.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  const namespaceImportAliases = new Set<string>();

  const hasDirectPilotCardImport = sourceFile.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement)) {
      return false;
    }
    const moduleSpecifierNode = statement.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifierNode)) {
      return false;
    }
    if (!isUsePilotIntelPipelineModuleSpecifier(moduleSpecifierNode.text)) {
      return false;
    }
    const importClause = statement.importClause;
    if (!importClause || !importClause.namedBindings) {
      return false;
    }

    if (ts.isNamedImports(importClause.namedBindings)) {
      return importClause.namedBindings.elements.some((element) => {
        const importedName = element.propertyName?.text ?? element.name.text;
        return importedName === "PilotCard";
      });
    }

    if (ts.isNamespaceImport(importClause.namedBindings)) {
      namespaceImportAliases.add(importClause.namedBindings.name.text);
    }

    return false;
  });

  if (hasDirectPilotCardImport) {
    return true;
  }

  let importTypePilotCardReferenceDetected = false;
  const visitImportTypeNode = (node: ts.Node): void => {
    if (importTypePilotCardReferenceDetected) {
      return;
    }
    if (ts.isImportTypeNode(node) && importTypeReferencesPilotCard(node)) {
      importTypePilotCardReferenceDetected = true;
      return;
    }
    ts.forEachChild(node, visitImportTypeNode);
  };
  visitImportTypeNode(sourceFile);
  if (importTypePilotCardReferenceDetected) {
    return true;
  }

  if (namespaceImportAliases.size === 0) {
    return false;
  }

  let namespacePilotCardReferenceDetected = false;
  const visit = (node: ts.Node): void => {
    if (namespacePilotCardReferenceDetected) {
      return;
    }
    if (ts.isQualifiedName(node) && node.right.text === "PilotCard") {
      let leftmostEntity: ts.EntityName = node.left;
      while (ts.isQualifiedName(leftmostEntity)) {
        leftmostEntity = leftmostEntity.left;
      }
      if (namespaceImportAliases.has(leftmostEntity.text)) {
        namespacePilotCardReferenceDetected = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return namespacePilotCardReferenceDetected;
}

function collectSourceFiles(rootDir: string): string[] {
  const files: string[] = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.shift();
    if (!currentDir) {
      continue;
    }
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        files.push(absolutePath);
      }
    }
  }

  return files;
}

describe("pilot domain boundary", () => {
  it("detects equivalent PilotCard import syntaxes from usePilotIntelPipeline", () => {
    const bypassVariants = [
      `import type { PilotCard } from "./usePilotIntelPipeline";`,
      `import { type PilotCard } from "./usePilotIntelPipeline";`,
      `import type {
        PilotCard as PipelinePilotCard
      } from "./usePilotIntelPipeline";`,
      `import { PilotCard } from "./usePilotIntelPipeline";`,
      `import type * as Pipeline from "./usePilotIntelPipeline";
      type PipelinePilotCard = Pipeline.PilotCard;`,
      `type PipelinePilotCard = import("./usePilotIntelPipeline").PilotCard;`,
      `type PipelinePilotCard = import("./usePilotIntelPipeline")["PilotCard"];`,
      `type PipelinePilotCard = (import("./usePilotIntelPipeline"))["PilotCard"];`,
      "type PipelinePilotCard = import(\"./usePilotIntelPipeline\")[`PilotCard`];"
    ];

    for (const sourceText of bypassVariants) {
      expect(importsPilotCardFromUsePilotIntelPipeline(sourceText)).toBe(true);
    }
  });

  it("keeps PilotCard contract imports out of usePilotIntelPipeline module boundary", () => {
    const srcRoot = fileURLToPath(new URL("../", import.meta.url));
    const files = collectSourceFiles(srcRoot);
    const offenders = files
      .filter((filePath) => !filePath.endsWith("usePilotIntelPipeline.ts"))
      .filter((filePath) =>
        importsPilotCardFromUsePilotIntelPipeline(readFileSync(filePath, "utf8"))
      )
      .map((filePath) => filePath.replace(`${srcRoot}`, "src/"));

    expect(
      offenders,
      `Move PilotCard type imports to shared pilot-domain contracts:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
