import datetime
import os
import json

def is_trade_allowed(trade_time_ranges: list, avoid_trade_time_ranges: list) -> bool:
    """
    Determines if an order can be placed at the current time.
    
    - First checks timeconfig.json for global trading hours restrictions
    - If trade_time_ranges is provided and non-empty, the current time must fall
      within at least one of the ranges (format "HHMM-HHMM").
    - If avoid_trade_time_ranges is provided, the current time must NOT fall
      within any of those ranges.
    Returns True if trading is allowed, False otherwise.
    """
    # Check timeconfig.json for global trading hours restrictions
    time_config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "config", "timeconfig.json")
    if os.path.exists(time_config_path):
        try:
            with open(time_config_path, 'r') as file:
                time_config = json.load(file)
                
            # If trading hours are restricted, check if current time is within allowed range
            if time_config.get("restrict_trading_hours", False):
                # Get current UTC time
                now = datetime.datetime.now(datetime.timezone.utc)
                current_hour = now.hour
                current_minute = now.minute
                current_time_num = current_hour * 100 + current_minute
                
                # Parse start and end times
                start_time = time_config.get("trading_start_time", "0000")
                end_time = time_config.get("trading_end_time", "2359")
                
                start_time_num = int(start_time)
                end_time_num = int(end_time)
                
                print(f"[DEBUG] Trading hours config: Restrict={time_config.get('restrict_trading_hours')}, Start={start_time}, End={end_time}")
                print(f"[DEBUG] Current UTC time: {now.strftime('%H:%M')} ({current_time_num})")
                
                # Check if current time is within trading hours
                if start_time_num <= end_time_num:
                    # Regular time range (e.g., 9:00 to 17:00)
                    if not (start_time_num <= current_time_num <= end_time_num):
                        print("[DEBUG] Outside of configured trading hours (regular time range)")
                        return False
                else:
                    # Overnight time range (e.g., 22:00 to 8:00)
                    if not (current_time_num >= start_time_num or current_time_num <= end_time_num):
                        print("[DEBUG] Outside of configured trading hours (overnight time range)")
                        return False
        except Exception as e:
            print(f"[DEBUG] Error reading timeconfig.json: {str(e)}")
    
    # Continue with existing time range checks - using GMT/UTC instead of local time
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    now = now_utc.time()
    print(f"[DEBUG] Current GMT time: {now}")

    if trade_time_ranges and any(r.strip() for r in trade_time_ranges):
        allowed = False
        for range_str in trade_time_ranges:
            if not range_str.strip():
                continue
            try:
                start_str, end_str = range_str.split('-')
                start_time = datetime.time(int(start_str[:2]), int(start_str[2:]))
                end_time = datetime.time(int(end_str[:2]), int(end_str[2:]))
                print(f"[DEBUG] Allowed time range (GMT): {start_time} to {end_time}")
            except Exception as e:
                print(f"[DEBUG] Failed to parse allowed range '{range_str}': {e}")
                continue
            if start_time <= end_time:
                if start_time <= now <= end_time:
                    allowed = True
                    break
            else:
                # Range spans midnight
                if now >= start_time or now <= end_time:
                    allowed = True
                    break
        if not allowed:
            print("[DEBUG] Current GMT time not within any allowed trading range.")
            return False

    if avoid_trade_time_ranges and any(r.strip() for r in avoid_trade_time_ranges):
        for range_str in avoid_trade_time_ranges:
            if not range_str.strip():
                continue
            try:
                start_str, end_str = range_str.split('-')
                start_time = datetime.time(int(start_str[:2]), int(start_str[2:]))
                end_time = datetime.time(int(end_str[:2]), int(end_str[2:]))
                print(f"[DEBUG] Avoid time range (GMT): {start_time} to {end_time}")
            except Exception as e:
                print(f"[DEBUG] Failed to parse avoid range '{range_str}': {e}")
                continue
            if start_time <= end_time:
                if start_time <= now <= end_time:
                    print("[DEBUG] Current GMT time is within an avoid trading range.")
                    return False
            else:
                if now >= start_time or now <= end_time:
                    print("[DEBUG] Current GMT time is within an avoid trading range (spanning midnight).")
                    return False

    print("[DEBUG] Trading is allowed at this GMT time.")
    return True

def format_time_display(time_str):
    """Format a time string from '0000' format to '00:00' format"""
    if len(time_str) == 4:
        return f"{time_str[:2]}:{time_str[2:]}"
    return time_str

def get_trading_hours_message():
    """Get a formatted message with the current trading hour restrictions"""
    time_config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "config", "timeconfig.json")
    try:
        if os.path.exists(time_config_path):
            with open(time_config_path, 'r') as file:
                time_config = json.load(file)
                
            if time_config.get("restrict_trading_hours", False):
                start_time = time_config.get("trading_start_time", "0000")
                end_time = time_config.get("trading_end_time", "2359")
                
                formatted_start = format_time_display(start_time)
                formatted_end = format_time_display(end_time)
                
                return f"Trading is restricted to the hours between {formatted_start} GMT and {formatted_end} GMT"
    except Exception as e:
        print(f"[DEBUG] Error reading timeconfig.json for message: {str(e)}")
    
    return "Trading is not allowed at the current time due to trading hour restrictions" 