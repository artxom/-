import chromadb
from chromadb.utils import embedding_functions
import uuid
from typing import List, Dict, Any

class RAGManager:
    def __init__(self, db_path="./local_chroma_db", collection_name="knowledge_base"):
        self.db_path = db_path
        self.collection_name = collection_name
        self.client = chromadb.PersistentClient(path=self.db_path)
        
        # By not specifying an embedding_function, Chroma automatically uses its lightweight DefaultEmbeddingFunction (ONNX)
        # This completely eliminates the massive and fragile sentence_transformers/PyTorch dependencies for PyInstaller.
        self.collection = self.client.get_or_create_collection(
            name=self.collection_name
        )

    def add_knowledge(self, contents: List[str], metadatas: List[Dict[str, Any]] = None):
        if not contents:
            return
            
        ids = [str(uuid.uuid4()) for _ in contents]
        
        if metadatas:
            self.collection.add(
                documents=contents,
                metadatas=metadatas,
                ids=ids
            )
        else:
            self.collection.add(
                documents=contents,
                ids=ids
            )

    def search_knowledge(self, query: str, top_k: int = 3) -> List[Dict[str, Any]]:
        results = self.collection.query(
            query_texts=[query],
            n_results=top_k
        )
        
        # Format the results
        formatted_results = []
        if results and results['documents'] and len(results['documents']) > 0:
            docs = results['documents'][0]
            metas = results['metadatas'][0] if 'metadatas' in results and results['metadatas'] else [{}] * len(docs)
            distances = results['distances'][0] if 'distances' in results and results['distances'] else [0] * len(docs)
            
            for doc, meta, dist in zip(docs, metas, distances):
                formatted_results.append({
                    "content": doc,
                    "metadata": meta,
                    "distance": dist
                })
                
        return formatted_results

    def get_all_knowledge(self) -> List[Dict[str, Any]]:
        results = self.collection.get()
        formatted_results = []
        if results and results['documents']:
            docs = results['documents']
            metas = results['metadatas'] if 'metadatas' in results and results['metadatas'] else [{}] * len(docs)
            ids = results['ids']
            
            for doc, meta, doc_id in zip(docs, metas, ids):
                formatted_results.append({
                    "id": doc_id,
                    "content": doc,
                    "metadata": meta
                })
        return formatted_results

    def update_knowledge(self, doc_id: str, new_content: str, metadata: Dict[str, Any] = None):
        if metadata:
            self.collection.update(
                ids=[doc_id],
                documents=[new_content],
                metadatas=[metadata]
            )
        else:
            self.collection.update(
                ids=[doc_id],
                documents=[new_content]
            )

    def delete_knowledge(self, doc_id: str):
        self.collection.delete(ids=[doc_id])

rag_manager = RAGManager()
