def calculate_item_total(price, qty):
    return float(price) * float(qty)

def calculate_bill_total(cart):
    return sum(item["total"] for item in cart)
