from rag import rag_manager

print("Adding knowledge...")
rag_manager.add_knowledge(["This is a test of the RAG system."])

print("Searching knowledge...")
results = rag_manager.search_knowledge("test")
print("Search results:", results)

print("Getting all knowledge...")
all_k = rag_manager.get_all_knowledge()
print("All knowledge:", all_k)

if all_k:
    print("Deleting knowledge...")
    rag_manager.delete_knowledge(all_k[0]['id'])
    print("After deletion:", rag_manager.get_all_knowledge())
