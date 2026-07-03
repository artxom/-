from lineage import lineage_manager

t1 = lineage_manager.add_table("public", "users", "User table")
c1 = lineage_manager.add_column(t1, "id", "int")
t2 = lineage_manager.add_table("public", "orders", "Order table")
c2 = lineage_manager.add_column(t2, "user_id", "int")

lineage_manager.add_edge(c1, c2, "Foreign key relation")

print("Downstream of users.id:", lineage_manager.get_downstream(c1))
print("Upstream of orders.user_id:", lineage_manager.get_upstream(c2))
