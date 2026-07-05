from rag import RAGManager
rag_manager = RAGManager(db_path="./local_chroma_db")
try:
    rag_manager.add_knowledge("test string")
    print("Success")
except Exception as e:
    print("Error:", e)
